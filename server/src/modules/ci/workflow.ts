import { stringify } from 'yaml';
import type { CiExportInput, CiFile } from '@devdigest/shared';
import { RUNNER_RUN_COMMAND, WORKFLOW_PATH, WORKFLOW_VERSION } from './constants.js';

/**
 * A4 — pure GitHub Actions workflow generation (SPEC-05 AC-7, AC-8, AC-21,
 * EC-3; ADDENDUM v2 decision 6 — workflow security hardening). Built as a
 * plain object and serialized with the `yaml` library (the same one
 * `agent-runner` parses with) so the output is always structurally valid —
 * even for a single trigger — rather than string-concatenated.
 *
 * Secrets NEVER appear as literal values here (AC-21): only
 * `${{ secrets.* }}` / `${{ github.* }}` expression strings, resolved by the
 * TARGET repo's own GitHub Actions runtime, never by this process. GitHub
 * expressions that carry a secret value are always routed through a step
 * `env:` block and referenced as `$VAR` inside `run:` — never interpolated
 * directly into the script text — so a malicious PR title/branch name can't
 * turn an expression into a script-injection vector.
 *
 * SHA-pinning (W1, resolved): `actions/checkout`/`actions/setup-node` below
 * are pinned to a verified full commit SHA (a bare `owner/action@<sha>` ref,
 * NO trailing ` # v4` comment — that would force YAML to quote the value and
 * GitHub would then fail to resolve the "quoted-literal-plus-comment" as the
 * ref), not a mutable tag. The human-readable version lives in each step's
 * `name`. See `CHECKOUT_ACTION`/`SETUP_NODE_ACTION` below. server/INSIGHTS.md's
 * "Open Questions" entry flagging SHA-pinning as unresolved is now stale.
 */

/** `actions/checkout@v4`, pinned to its resolved commit SHA (W1).
 *  NOTE: the value is the bare `owner/action@<sha>` ref with NO trailing
 *  ` # v4` comment — a `#` inside a YAML scalar forces the serializer to quote
 *  the whole value, and GitHub then treats the quoted literal (comment
 *  included) as the ref and fails with "unable to resolve action". The version
 *  is surfaced via the step `name` instead. */
const CHECKOUT_ACTION = 'actions/checkout@11d5960a326750d5838078e36cf38b85af677262';
/** `actions/setup-node@v4`, pinned to its resolved commit SHA (W1). Bare ref, see CHECKOUT_ACTION. */
const SETUP_NODE_ACTION = 'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020';

export interface WorkflowIngestConfig {
  /** Where the runner POSTs `devdigest-result.json` after the review runs.
   *  Not a secret — baked as a literal (server's own public ingest base
   *  URL), matching the ADDENDUM v2 "Ingest auth contract". */
  ingestBaseUrl: string;
}

export interface WorkflowInput {
  triggers: CiExportInput['triggers'];
  postAs: CiExportInput['post_as'];
  /** ADDENDUM v2 — when provided, emits the ingest POST step after the
   *  runner step. Omitted → no ingest step (e.g. tests that only care about
   *  the review step shape). */
  ingest?: WorkflowIngestConfig;
}

export function buildWorkflowFile(input: WorkflowInput): CiFile {
  const env: Record<string, string> = {
    OPENROUTER_API_KEY: '${{ secrets.OPENROUTER_API_KEY }}',
    ...(input.postAs !== 'none' ? { GITHUB_TOKEN: '${{ secrets.GITHUB_TOKEN }}' } : {}),
    GITHUB_REPOSITORY: '${{ github.repository }}',
    PR_NUMBER: '${{ github.event.pull_request.number }}',
    DEVDIGEST_POST_AS: input.postAs,
  };

  const steps: Record<string, unknown>[] = [
    // Fork PRs: `pull_request` (kept deliberately, NEVER `pull_request_target`
    // — that trigger would run workflow code with write-token privileges
    // against untrusted PR content) gives a fork-originated run a read-only
    // GITHUB_TOKEN and no repo secrets. `actions/checkout` here only ever
    // checks out the PR's merge ref for the runner to DIFF/read — it never
    // executes anything from the fork with elevated permissions. A fork PR
    // therefore degrades cleanly: the review step runs, GitHub-posting steps
    // that need a write token simply have nothing to write with.
    { name: 'Checkout (actions/checkout v4)', uses: CHECKOUT_ACTION },
    { name: 'Set up Node.js (actions/setup-node v4)', uses: SETUP_NODE_ACTION, with: { 'node-version': '20' } },
    { name: 'Run DevDigest review', run: RUNNER_RUN_COMMAND, env },
    // Render the result into the GitHub Actions job summary so it is visible
    // natively on GitHub (the run's Summary page) with NO DevDigest API /
    // deploy required — independent of the optional studio ingest below.
    // `always()` so a blocking (failed) run still shows its findings.
    {
      name: 'DevDigest summary',
      if: 'always()',
      run: [
        'if [ -f devdigest-result.json ]; then',
        '  {',
        '    echo "## DevDigest review"',
        '    echo ""',
        `    jq -r '"- Agent: \\(.agent)\\n- Findings: \\(.findings_count)\\n- Critical: \\(.critical // 0) · Warning: \\(.warning // 0) · Suggestion: \\(.suggestion // 0)\\n- Cost: $\\(.cost_usd)"' devdigest-result.json`,
        '  } >> "$GITHUB_STEP_SUMMARY"',
        'else',
        '  echo "DevDigest produced no result artifact." >> "$GITHUB_STEP_SUMMARY"',
        'fi',
      ].join('\n'),
    },
  ];

  if (input.ingest) {
    steps.push({
      name: 'Report result to DevDigest',
      // Runs even if the review step failed, so a failed/blocked run is
      // still ingested (status, not just successes).
      if: 'always()',
      env: {
        // Configurable per-repo via an Actions VARIABLE (not a secret — it's
        // not sensitive), falling back to the studio's baked base URL. This
        // lets a user point a cloud runner at a public tunnel/deployment
        // (`vars.DEVDIGEST_INGEST_URL`) without re-exporting, since the baked
        // default is typically `http://localhost:*` which a GitHub-hosted
        // runner cannot reach.
        DEVDIGEST_INGEST_URL:
          "${{ vars.DEVDIGEST_INGEST_URL || '" + input.ingest.ingestBaseUrl + "' }}",
        // Bearer token stays a `${{ secrets.* }}` expression, never a literal
        // (AC-21) — resolved by the TARGET repo's own Actions runtime from a
        // secret the user pastes in once at export time (see the ingest auth
        // contract). Routed through `env:` (not interpolated into `run:`)
        // so it can never be logged or hijacked via script injection.
        DEVDIGEST_INGEST_TOKEN: '${{ secrets.DEVDIGEST_INGEST_TOKEN }}',
        DEVDIGEST_COMMIT_SHA: '${{ github.sha }}',
        DEVDIGEST_REPOSITORY: '${{ github.repository }}',
      },
      // Best-effort: reporting the result to the studio must NOT gate the CI
      // job. The pass/fail gate is the review verdict ("Fail CI on") in the
      // step above; if the studio ingest endpoint is unreachable (e.g. a local
      // dev API not exposed to the cloud runner) we surface a warning
      // annotation and exit 0 rather than failing the whole run.
      run: [
        'if [ -f devdigest-result.json ]; then',
        '  curl -sS -f -X POST "$DEVDIGEST_INGEST_URL/ci/ingest" \\',
        '    -H "Authorization: Bearer $DEVDIGEST_INGEST_TOKEN" \\',
        '    -H "Content-Type: application/json" \\',
        '    -H "X-Devdigest-Commit-Sha: $DEVDIGEST_COMMIT_SHA" \\',
        '    -H "X-Devdigest-Repository: $DEVDIGEST_REPOSITORY" \\',
        '    --data-binary @devdigest-result.json \\',
        '    || echo "::warning::DevDigest ingest failed — CI Runs not updated (is DEVDIGEST_INGEST_URL reachable from the runner?)"',
        'else',
        '  echo "No devdigest-result.json produced; skipping ingest."',
        'fi',
      ].join('\n'),
    });
  }

  const workflow = {
    name: 'DevDigest Review',
    // ADDENDUM v2 — "Workflow version": embedded so the CI tab (which reads
    // it back from `ci_installations.workflow_version`, persisted at export
    // time from the same `WORKFLOW_VERSION` constant) matches what's
    // actually checked into the target repo.
    //
    // ADDENDUM v2 decision 6 — least-privilege `permissions:`. `contents:
    // read` is always needed (checkout); `pull-requests: write` is granted
    // ONLY when the run will actually post to the PR (`post_as !== 'none'`).
    // Every other permission is omitted so GitHub defaults it to `none`.
    permissions: {
      contents: 'read',
      ...(input.postAs !== 'none' ? { 'pull-requests': 'write' } : {}),
    },
    on: {
      pull_request: {
        types: input.triggers,
      },
    },
    jobs: {
      review: {
        'runs-on': 'ubuntu-latest',
        steps,
      },
    },
  };

  return {
    path: WORKFLOW_PATH,
    contents: `# devdigest-workflow-version: ${WORKFLOW_VERSION}\n${stringify(workflow)}`,
    editable: true,
  };
}
