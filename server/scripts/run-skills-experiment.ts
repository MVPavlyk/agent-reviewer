/**
 * Control experiment for docs/specs/skills.md PR 9.
 *
 * Runs the seeded "API Contract Reviewer" agent against two fixture diffs
 * (docs/experiments/skills/{happy-path-test,route-signature-change}.diff),
 * each TWICE — with its linked skill ("Response Schema Stability") globally
 * disabled, then enabled (toggling `skills.enabled` per decision 1, not
 * unlinking, so the trace difference is unambiguous). Records run id,
 * `stats.tokens_in`, finding count, and whether `prompt_assembly.skills` was
 * null into docs/experiments/skills/RESULTS.md.
 *
 * Spins its own hermetic Postgres testcontainer (like the .it.test.ts suite)
 * and a REAL LLM call through whatever provider key is configured via
 * LocalSecretsProvider (~/.devdigest/secrets.json) — same resolution path the
 * app itself uses. No API key configured → the container throws ConfigError
 * before any call is made; this script surfaces that plainly rather than
 * faking a result.
 *
 * Run: `npx tsx scripts/run-skills-experiment.ts` from `server/`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { eq, and } from 'drizzle-orm';
import { startPg, type PgFixture } from '../test/helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXPERIMENTS_DIR = resolve(__dirname, '../../docs/experiments/skills');
const AGENT_NAME = 'API Contract Reviewer';
const SKILL_NAME = 'Response Schema Stability';
const TERMINAL = new Set(['done', 'failed', 'cancelled']);

const DIFFS = [
  { key: 'happy-path-test', label: 'Happy path (additive, no contract break)' },
  { key: 'route-signature-change', label: 'Route signature change (field removed, no version bump)' },
] as const;

interface Cell {
  diff: (typeof DIFFS)[number]['key'];
  diffLabel: string;
  skillsEnabled: boolean;
  runId: string;
  status: string | null;
  verdict: string | null;
  findingCount: number;
  findingTitles: string[];
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  promptAssemblySkillsPresent: boolean;
  error: string | null;
}

async function waitForRun(
  db: PgFixture['handle']['db'],
  prId: string,
  expected: number,
  timeoutMs = 120_000,
) {
  const start = Date.now();
  for (;;) {
    const runs = await db.select().from(t.agentRuns).where(eq(t.agentRuns.prId, prId));
    const terminal = runs.filter((r) => TERMINAL.has(r.status ?? ''));
    if (terminal.length >= expected) return runs;
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for run on PR ${prId}`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

async function main() {
  const pg = await startPg();
  let repoSeq = 0;
  const cells: Cell[] = [];

  try {
    const { workspaceId } = await seed(pg.handle.db);
    const config = loadConfig({ ...process.env, NODE_ENV: 'production' } as NodeJS.ProcessEnv);

    const [agent] = await pg.handle.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, AGENT_NAME)));
    const [skill] = await pg.handle.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, SKILL_NAME)));
    if (!agent || !skill) {
      throw new Error(`seed did not create "${AGENT_NAME}" / "${SKILL_NAME}" — run \`pnpm db:seed\` logic first`);
    }

    for (const d of DIFFS) {
      const diffText = readFileSync(resolve(EXPERIMENTS_DIR, `${d.key}.diff`), 'utf8');

      for (const skillsEnabled of [false, true] as const) {
        await pg.handle.db.update(t.skills).set({ enabled: skillsEnabled }).where(eq(t.skills.id, skill.id));

        const name = `exp-${d.key}-${skillsEnabled ? 'on' : 'off'}-${repoSeq++}`;
        const [repo] = await pg.handle.db
          .insert(t.repos)
          .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
          .returning();
        const [pr] = await pg.handle.db
          .insert(t.pullRequests)
          .values({
            workspaceId,
            repoId: repo!.id,
            number: 1,
            title: `Experiment: ${d.key} (skills ${skillsEnabled ? 'on' : 'off'})`,
            author: 'experiment',
            branch: 'exp',
            base: 'main',
            headSha: 'deadbeef',
            additions: 8,
            deletions: 2,
            filesCount: 1,
            status: 'needs_review',
            body: null,
          })
          .returning();

        const app = await buildApp({
          config,
          db: pg.handle.db,
          overrides: { git: new MockGitClient({ diff: diffText }), github: new MockGitHubClient() },
        });

        const cell: Cell = {
          diff: d.key,
          diffLabel: d.label,
          skillsEnabled,
          runId: '',
          status: null,
          verdict: null,
          findingCount: 0,
          findingTitles: [],
          tokensIn: 0,
          tokensOut: 0,
          costUsd: null,
          promptAssemblySkillsPresent: false,
          error: null,
        };

        try {
          const res = await app.inject({
            method: 'POST',
            url: `/pulls/${pr!.id}/review`,
            payload: { agentId: agent.id },
          });
          if (res.statusCode !== 200) throw new Error(`POST /review → ${res.statusCode}: ${res.body}`);
          const runId = res.json().runs[0].run_id as string;
          cell.runId = runId;

          await waitForRun(pg.handle.db, pr!.id, 1);
          const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
          const [runRow] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
          const reviews = (
            await app.inject({ method: 'GET', url: `/pulls/${pr!.id}/reviews` })
          ).json() as Array<{ verdict: string; findings: { title: string }[] }>;

          cell.status = runRow?.status ?? null;
          cell.verdict = reviews[0]?.verdict ?? null;
          cell.findingCount = trace.stats?.findings ?? 0;
          cell.findingTitles = reviews[0]?.findings?.map((f) => f.title) ?? [];
          cell.tokensIn = trace.stats?.tokens_in ?? 0;
          cell.tokensOut = trace.stats?.tokens_out ?? 0;
          cell.costUsd = trace.stats?.cost_usd ?? null;
          cell.promptAssemblySkillsPresent = trace.prompt_assembly?.skills != null;

          console.log(
            `[${d.key} / skills=${skillsEnabled}] status=${cell.status} verdict=${cell.verdict} findings=${cell.findingCount} tokens_in=${cell.tokensIn}`,
          );
        } catch (err) {
          cell.error = (err as Error).message;
          console.error(`[${d.key} / skills=${skillsEnabled}] FAILED: ${cell.error}`);
        } finally {
          await app.close();
        }

        cells.push(cell);
      }
    }
  } finally {
    await pg.stop();
  }

  writeResults(cells);
}

function writeResults(cells: Cell[]): void {
  const runAt = new Date().toISOString();
  const lines: string[] = [];
  lines.push('# Skills control experiment — RESULTS');
  lines.push('');
  lines.push(`Run at: ${runAt}`);
  lines.push(`Agent: **${AGENT_NAME}** · Skill: **${SKILL_NAME}** (toggled via \`skills.enabled\`, link kept intact)`);
  lines.push('');
  lines.push(
    '> **Caveat — read before trusting these numbers.** This is a demonstration, ' +
      'n=1 per cell, against a non-deterministic model (no `temperature: 0` — the ' +
      'OpenRouter adapter did not expose it at the time this ran). It is **not** a ' +
      'statistically valid eval. A single run can go either way on a borderline ' +
      'finding; treat the `prompt_assembly.skills` presence/absence and the ' +
      '`tokens_in` delta as the reliable signals (those are pipeline facts, not ' +
      'model judgment), and the verdict/finding columns as one sample, not a proof.',
  );
  lines.push('');
  lines.push('| Diff | Skills | Run id | Status | Verdict | Findings | tokens_in | cost_usd | skills in prompt_assembly |');
  lines.push('|---|---|---|---|---|---|---|---|---|');
  for (const c of cells) {
    lines.push(
      `| ${c.diffLabel} | ${c.skillsEnabled ? 'ON' : 'off'} | \`${c.runId || '—'}\` | ${c.status ?? (c.error ? 'error' : '—')} | ${c.verdict ?? '—'} | ${c.findingCount} | ${c.tokensIn} | ${c.costUsd ?? '—'} | ${c.promptAssemblySkillsPresent} |`,
    );
  }
  lines.push('');

  for (const d of DIFFS) {
    lines.push(`## ${d.label}`);
    lines.push('');
    for (const skillsEnabled of [false, true]) {
      const c = cells.find((x) => x.diff === d.key && x.skillsEnabled === skillsEnabled);
      if (!c) continue;
      lines.push(`### skills ${skillsEnabled ? 'ON' : 'OFF'}`);
      if (c.error) {
        lines.push(`Run failed: ${c.error}`);
      } else {
        lines.push(`- Verdict: **${c.verdict}**, ${c.findingCount} finding(s)`);
        if (c.findingTitles.length > 0) {
          for (const title of c.findingTitles) lines.push(`  - ${title}`);
        }
        lines.push(`- \`prompt_assembly.skills\` present: **${c.promptAssemblySkillsPresent}**`);
        lines.push(`- tokens_in: ${c.tokensIn}, tokens_out: ${c.tokensOut}, cost_usd: ${c.costUsd}`);
      }
      lines.push('');
    }
  }

  const outPath = resolve(EXPERIMENTS_DIR, 'RESULTS.md');
  writeFileSync(outPath, lines.join('\n') + '\n');
  console.log(`\nWrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
