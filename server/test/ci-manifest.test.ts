import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { AgentManifest } from '@devdigest/shared';
import { buildManifestBundle } from '../src/modules/ci/manifest.js';
import { buildWorkflowFile } from '../src/modules/ci/workflow.js';
import { buildBundleFiles } from '../src/modules/ci/bundle.js';
import { assertValidRepo, InvalidRepoError, slugify, uniqueSlugs } from '../src/modules/ci/paths.js';

const AGENT = {
  name: 'Security Reviewer',
  provider: 'openrouter' as const,
  model: 'openrouter/deepseek-v4-flash',
  systemPrompt: 'Review PRs for security issues.',
  strategy: 'single-pass' as const,
  ciFailOn: 'critical' as const,
};

describe('buildManifestBundle', () => {
  it('produces a manifest.yaml whose parsed YAML passes AgentManifest.safeParse (AC-5, NFR-5)', () => {
    const { manifestFile } = buildManifestBundle(AGENT, []);
    expect(manifestFile.path).toBe('.devdigest/agents/security-reviewer.yaml');
    const parsed = parseYaml(manifestFile.contents);
    const result = AgentManifest.safeParse(parsed);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe(AGENT.name);
      expect(result.data.ci_fail_on).toBe('critical');
      expect(result.data.skills).toEqual([]);
    }
  });

  it('no linked skills → skills: [] and zero skill files (EC-1)', () => {
    const { skillFiles, manifestFile } = buildManifestBundle(AGENT, []);
    expect(skillFiles).toHaveLength(0);
    const parsed = AgentManifest.parse(parseYaml(manifestFile.contents));
    expect(parsed.skills).toEqual([]);
  });

  it('one .devdigest/skills/<slug>.md per linked skill, slug matching the manifest skills array (AC-6)', () => {
    const skills = [
      { name: 'API Contract Rubric', body: 'Check the response shape.' },
      { name: 'Security Checklist', body: 'Look for injections.' },
    ];
    const { manifestFile, skillFiles } = buildManifestBundle(AGENT, skills);
    const parsed = AgentManifest.parse(parseYaml(manifestFile.contents));

    expect(skillFiles).toHaveLength(2);
    expect(skillFiles.map((f) => f.path)).toEqual([
      '.devdigest/skills/api-contract-rubric.md',
      '.devdigest/skills/security-checklist.md',
    ]);
    expect(skillFiles[0]!.contents).toBe(skills[0]!.body);
    expect(parsed.skills).toEqual(['api-contract-rubric', 'security-checklist']);
  });

  it('a system_prompt with YAML-special characters and newlines round-trips (EC-5)', () => {
    const tricky = {
      ...AGENT,
      systemPrompt:
        'Review: "quoted", colons: like this\nmultiline\n- not actually a list\n  nested: value',
    };
    const { manifestFile } = buildManifestBundle(tricky, []);
    const parsed = AgentManifest.parse(parseYaml(manifestFile.contents));
    expect(parsed.system_prompt).toBe(tricky.systemPrompt);
  });

  it('two skills whose names slugify to the same base get de-duplicated (EC-4)', () => {
    const skills = [
      { name: 'Security!!', body: 'a' },
      { name: 'Security??', body: 'b' },
    ];
    const { skillFiles } = buildManifestBundle(AGENT, skills);
    expect(skillFiles.map((f) => f.path)).toEqual([
      '.devdigest/skills/security.md',
      '.devdigest/skills/security-2.md',
    ]);
  });
});

describe('buildWorkflowFile', () => {
  it('single trigger stays valid YAML (EC-3) and calls the real runner with all env (AC-7, AC-8)', () => {
    const file = buildWorkflowFile({ triggers: ['opened'], postAs: 'github_review' });
    expect(file.path).toBe('.github/workflows/devdigest-review.yml');
    const parsed = parseYaml(file.contents) as any;
    expect(parsed.on.pull_request.types).toEqual(['opened']);
    expect(parsed.jobs.review['runs-on']).toBe('ubuntu-latest');
    const steps: any[] = parsed.jobs.review.steps;
    // W1 — pinned to a resolved commit SHA (bare ref, NO inline ` # v4` comment:
    // a `#` in the scalar would force YAML to quote it and GitHub would fail to
    // resolve the action). Version lives in the step name instead.
    expect(steps[0].uses).toBe('actions/checkout@11d5960a326750d5838078e36cf38b85af677262');
    expect(steps[1].uses).toBe('actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020');
    // Guard the actual regression: the serialized YAML must not quote `uses`
    // nor carry a `# v4`-style trailing comment on those lines.
    expect(file.contents).toContain('uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262\n');
    expect(file.contents).not.toMatch(/uses:.*#/);
    expect(steps[1].with['node-version']).toBe('20');
    expect(steps[2].run).toBe('node .devdigest/runner/index.js');
    expect(steps[2].env).toMatchObject({
      OPENROUTER_API_KEY: '${{ secrets.OPENROUTER_API_KEY }}',
      GITHUB_TOKEN: '${{ secrets.GITHUB_TOKEN }}',
      GITHUB_REPOSITORY: '${{ github.repository }}',
      PR_NUMBER: '${{ github.event.pull_request.number }}',
      DEVDIGEST_POST_AS: 'github_review',
    });
  });

  it('post_as "none" omits GITHUB_TOKEN from env (AC-8)', () => {
    const file = buildWorkflowFile({ triggers: ['opened', 'synchronize'], postAs: 'none' });
    const parsed = parseYaml(file.contents) as any;
    const env = parsed.jobs.review.steps[2].env;
    expect(env.GITHUB_TOKEN).toBeUndefined();
    expect(env.DEVDIGEST_POST_AS).toBe('none');
  });

  it('generated contents never carry a literal secret value, only secrets.*/github.* expressions (AC-21)', () => {
    const file = buildWorkflowFile({ triggers: ['opened'], postAs: 'github_review' });
    expect(file.contents).not.toMatch(/sk-[a-zA-Z0-9]/);
    expect(file.contents).toContain('secrets.OPENROUTER_API_KEY');
    expect(file.contents).toContain('secrets.GITHUB_TOKEN');
  });

  // ADDENDUM v2 decision 6 — workflow security hardening.
  describe('hardening (ADDENDUM v2 decision 6)', () => {
    it('permissions: contents:read always; pull-requests:write only when post_as !== "none"', () => {
      const withPost = buildWorkflowFile({ triggers: ['opened'], postAs: 'github_review' });
      const parsedWithPost = parseYaml(withPost.contents) as any;
      expect(parsedWithPost.permissions).toEqual({ contents: 'read', 'pull-requests': 'write' });

      const noPost = buildWorkflowFile({ triggers: ['opened'], postAs: 'none' });
      const parsedNoPost = parseYaml(noPost.contents) as any;
      expect(parsedNoPost.permissions).toEqual({ contents: 'read' });
      expect(parsedNoPost.permissions['pull-requests']).toBeUndefined();
    });

    it('keeps the pull_request trigger, never pull_request_target', () => {
      const file = buildWorkflowFile({ triggers: ['opened'], postAs: 'github_review' });
      const parsed = parseYaml(file.contents) as any;
      expect(parsed.on.pull_request).toBeDefined();
      expect(parsed.on.pull_request_target).toBeUndefined();
    });

    it('embeds a WORKFLOW_VERSION marker the CI tab can read back', () => {
      const file = buildWorkflowFile({ triggers: ['opened'], postAs: 'github_review' });
      expect(file.contents).toMatch(/devdigest-workflow-version: \d+/);
    });

    it('with an ingest config, adds a POST /ci/ingest step with no literal secret and the required fields', () => {
      const file = buildWorkflowFile({
        triggers: ['opened'],
        postAs: 'github_review',
        ingest: { ingestBaseUrl: 'https://devdigest.example.com' },
      });
      const parsed = parseYaml(file.contents) as any;
      const steps: any[] = parsed.jobs.review.steps;
      const ingestStep = steps.find((s) => s.name === 'Report result to DevDigest');
      expect(ingestStep).toBeDefined();
      expect(ingestStep.env.DEVDIGEST_INGEST_TOKEN).toBe('${{ secrets.DEVDIGEST_INGEST_TOKEN }}');
      // URL is a per-repo Actions variable with the baked base URL as fallback
      // (so a cloud runner can be pointed at a public tunnel without re-export).
      expect(ingestStep.env.DEVDIGEST_INGEST_URL).toBe(
        "${{ vars.DEVDIGEST_INGEST_URL || 'https://devdigest.example.com' }}",
      );
      // Best-effort: ingest failure warns, never fails the job (the gate is the
      // review verdict, not studio reachability).
      expect(ingestStep.run).toContain('|| echo "::warning::');
      expect(ingestStep.env.DEVDIGEST_COMMIT_SHA).toBe('${{ github.sha }}');
      expect(ingestStep.env.DEVDIGEST_REPOSITORY).toBe('${{ github.repository }}');
      expect(ingestStep.run).toContain('/ci/ingest');
      expect(ingestStep.run).not.toMatch(/sk-[a-zA-Z0-9]/);
      // The token/sha/repo expressions are only ever referenced via $VAR in
      // the script — never interpolated as `${{ ... }}` directly into `run:`.
      expect(ingestStep.run).not.toContain('${{');
    });

    it('always emits a job-summary step (GitHub-native result, no API required)', () => {
      const parsed = parseYaml(buildWorkflowFile({ triggers: ['opened'], postAs: 'none' }).contents) as any;
      const steps: any[] = parsed.jobs.review.steps;
      const summary = steps.find((s) => s.name === 'DevDigest summary');
      expect(summary).toBeDefined();
      expect(summary.if).toBe('always()');
      expect(summary.run).toContain('$GITHUB_STEP_SUMMARY');
      expect(summary.run).toContain('devdigest-result.json');
    });

    it('without an ingest config, no ingest step is emitted', () => {
      const file = buildWorkflowFile({ triggers: ['opened'], postAs: 'github_review' });
      const parsed = parseYaml(file.contents) as any;
      const steps: any[] = parsed.jobs.review.steps;
      expect(steps.find((s) => s.name === 'Report result to DevDigest')).toBeUndefined();
    });
  });
});

describe('buildBundleFiles', () => {
  it('includes the runner bundle AND memory.jsonl (ADDENDUM v2 decision 3 — reverses AC-9\'s exclusion)', () => {
    const files = buildBundleFiles({
      agent: AGENT,
      skills: [],
      triggers: ['opened', 'synchronize', 'reopened'],
      postAs: 'github_review',
      runnerBundleContents: '/* compiled runner */',
      memoryEntries: [],
    });
    const paths = files.map((f) => f.path);
    expect(paths).toContain('.devdigest/runner/index.js');
    expect(paths).toContain('.devdigest/memory.jsonl');
    const runnerFile = files.find((f) => f.path === '.devdigest/runner/index.js')!;
    expect(runnerFile.contents).toBe('/* compiled runner */');
    expect(runnerFile.editable).toBe(false);
  });

  it('memory.jsonl serializes one JSON object per line, verbatim content (no parse/eval)', () => {
    const files = buildBundleFiles({
      agent: AGENT,
      skills: [],
      triggers: ['opened'],
      postAs: 'none',
      runnerBundleContents: 'x',
      memoryEntries: [
        { kind: 'decision', scope: 'global', content: 'Use pnpm.', confidence: 0.8, createdAt: '2026-01-01T00:00:00.000Z' },
        { kind: 'fact', scope: 'global', content: '<script>alert(1)</script>', confidence: null, createdAt: '2026-01-02T00:00:00.000Z' },
      ],
    });
    const memoryFile = files.find((f) => f.path === '.devdigest/memory.jsonl')!;
    const lines = memoryFile.contents.split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!)).toMatchObject({ kind: 'decision', content: 'Use pnpm.' });
    expect(JSON.parse(lines[1]!)).toMatchObject({ content: '<script>alert(1)</script>' });
  });

  it('zero memory entries → empty (but present) memory.jsonl, no break', () => {
    const files = buildBundleFiles({
      agent: AGENT,
      skills: [],
      triggers: ['opened'],
      postAs: 'none',
      runnerBundleContents: 'x',
      memoryEntries: [],
    });
    const memoryFile = files.find((f) => f.path === '.devdigest/memory.jsonl')!;
    expect(memoryFile.contents).toBe('');
  });

  it('every generated path is relative, normalized, and free of ".." segments (AC-10)', () => {
    const files = buildBundleFiles({
      agent: AGENT,
      skills: [{ name: '../../evil', body: 'x' }],
      triggers: ['opened'],
      postAs: 'none',
      runnerBundleContents: 'x',
      memoryEntries: [],
    });
    for (const f of files) {
      expect(f.path.startsWith('/')).toBe(false);
      expect(f.path.split('/')).not.toContain('..');
    }
  });
});

describe('paths — untrusted input handling (AC-20)', () => {
  it('accepts a well-formed owner/name repo', () => {
    expect(() => assertValidRepo('acme/payments-api')).not.toThrow();
  });

  it('rejects a malformed repo string', () => {
    expect(() => assertValidRepo('not-a-repo')).toThrow(InvalidRepoError);
    expect(() => assertValidRepo('acme/../../etc/passwd')).toThrow(InvalidRepoError);
    expect(() => assertValidRepo('')).toThrow(InvalidRepoError);
  });

  it('slugify strips unsafe characters and falls back when empty', () => {
    expect(slugify('Hello, World!', 'x')).toBe('hello-world');
    expect(slugify('!!!', 'fallback')).toBe('fallback');
  });

  it('uniqueSlugs de-duplicates collisions', () => {
    expect(uniqueSlugs(['A', 'a', 'A'], 'x')).toEqual(['a', 'a-2', 'a-3']);
  });
});
