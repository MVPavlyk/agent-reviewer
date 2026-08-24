import 'dotenv/config';
import { createDb, type Db } from './client.js';
import * as t from './schema.js';
import { eq, and } from 'drizzle-orm';
import {
  GENERAL_REVIEWER_PROMPT,
  SECURITY_REVIEWER_PROMPT,
  PERFORMANCE_REVIEWER_PROMPT,
  TEST_QUALITY_REVIEWER_PROMPT,
  API_CONTRACT_REVIEWER_PROMPT,
} from './seed-prompts.js';

/** Default provider/model for the built-in reviewer agents. */
const DEFAULT_PROVIDER = 'openrouter' as const;
const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash';

/**
 * Seed the starter's demo data. Idempotent: re-running upserts the default
 * workspace/user and the demo fixtures.
 *
 * Seeds: default workspace + system user + membership, default settings,
 * demo repo (acme/payments-api), PR #482 with files/commits, a sample review
 * with a few findings, and the three built-in agents (General + Security +
 * Performance), all on the default openrouter/deepseek-v4-flash provider+model.
 *
 * Course lessons populate the other tables (skills, conventions, memory, eval,
 * …) once their features are built — they start empty here.
 *
 * L-06 (eval pipeline): PR #482's `pr_files` now carry real unified-diff
 * `patch` bodies and its review carries 11 findings, all resolved
 * (accepted_at XOR dismissed_at), so the eval pipeline has a real dataset to
 * convert into eval cases from day one. Every block below (pr_files, review,
 * findings, `agent_id` backfill) does its OWN "insert if missing / backfill
 * if present but incomplete" check — none of it is gated behind the outer
 * `if (!pr)`, because on any already-seeded dev database `pr` already
 * exists and that gate would silently skip the new columns forever.
 */

export const DEFAULT_WORKSPACE_NAME = 'default';
export const SYSTEM_USER_EMAIL = 'you@local';

// ---- PR #482 pr_files: unified-diff hunk BODIES only (no `diff --git`/`---`/
// `+++` headers — `diffFromPrFiles` in modules/reviews/diff-loader.ts adds
// those back when reassembling a UnifiedDiff from persisted patches).
const CONFIG_PATCH = [
  '@@ -1,8 +1,11 @@',
  " export const config = {",
  "   port: process.env.PORT || 3000,",
  "   env: process.env.NODE_ENV || 'development',",
  "+  stripeSecretKey: 'sk_live_EXAMPLE_NOT_A_REAL_KEY',",
  '+  rateLimit: {',
  '+    windowMs: 60_000,',
  '+    max: 100,',
  '+  },',
  '+  webhookSecret: process.env.WEBHOOK_SECRET,',
  '   dbUrl: process.env.DATABASE_URL,',
  ' };',
].join('\n');

const USERS_PATCH = [
  '@@ -40,8 +45,12 @@ async function listUsers(ids: string[]) {',
  ' export async function listUsers(ids: string[]) {',
  '-  return ids.map((id) => db.users.findOne(id));',
  '+  const users = [];',
  '+  for (const id of ids) {',
  '+    const user = await db.users.findOne(id);',
  '+    users.push(user);',
  '+  }',
  '+  return users;',
  ' }',
  '',
  ' export async function getUser(id: string) {',
].join('\n');

const RATELIMIT_PATCH = [
  '@@ -1,3 +1,25 @@',
  " import { FastifyPluginAsync } from 'fastify';",
  "+import type { FastifyRequest, FastifyReply } from 'fastify';",
  '+',
  '+interface Bucket {',
  '+  tokens: number;',
  '+  lastRefill: number;',
  '+}',
  '+',
  '+const buckets = new Map<string, Bucket>();',
  '+',
  '+function refill(bucket: Bucket, now: number, rate: number, capacity: number) {',
  '+  const elapsed = now - bucket.lastRefill;',
  '+  bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * rate);',
  '+  bucket.lastRefill = now;',
  '+}',
  '+',
  '+export function rateLimitPlugin(): FastifyPluginAsync {',
  '+  return async (app) => {',
  "+    app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {",
  '+      const key = req.ip;',
  '+      const bucket = buckets.get(key) ?? { tokens: 10, lastRefill: Date.now() };',
  '+      refill(bucket, Date.now(), 1, 10);',
  '+    });',
  '+  };',
  '+}',
].join('\n');

const WEBHOOKS_PATCH = [
  '@@ -10,6 +10,15 @@ export async function handleWebhook(req: FastifyRequest, reply: FastifyReply) {',
  "   const signature = req.headers['x-webhook-signature'];",
  '-  const body = req.body;',
  '+  const rawBody = req.rawBody;',
  '+  if (!signature || !verifySignature(rawBody, signature)) {',
  "+    return reply.code(401).send({ error: 'invalid signature' });",
  '+  }',
  '+  const body = JSON.parse(rawBody);',
  '+  const event = body.type;',
  "+  if (event === 'payment.succeeded') {",
  '+    await handlePaymentSucceeded(body.data);',
  '+  }',
  '   return reply.code(200).send({ ok: true });',
  ' }',
].join('\n');

interface SeedPrFile {
  path: string;
  additions: number;
  deletions: number;
  patch: string;
}

const SEED_PR_FILES: SeedPrFile[] = [
  { path: 'src/config.ts', additions: 8, deletions: 0, patch: CONFIG_PATCH },
  { path: 'src/api/users.ts', additions: 6, deletions: 1, patch: USERS_PATCH },
  { path: 'src/middleware/ratelimit.ts', additions: 24, deletions: 0, patch: RATELIMIT_PATCH },
  { path: 'src/api/public/webhooks.ts', additions: 9, deletions: 1, patch: WEBHOOKS_PATCH },
];

interface SeedFinding {
  file: string;
  startLine: number;
  endLine: number;
  severity: 'CRITICAL' | 'WARNING' | 'SUGGESTION';
  category: string;
  title: string;
  rationale: string;
  suggestion?: string;
  confidence: number;
  /** Exactly one of these is set — every seed finding is resolved. */
  accepted: boolean;
}

// L-06: >=8 convertible findings (all of these are kind='finding' + resolved),
// with >=3 dismissed findings sharing a file/hunk with an accepted one (D-9),
// so the eval-case dataset built from this seed has real must_not_flag
// material in the same "hot" zones as must_find material, not in cold spots
// an agent would never visit.
const SEED_FINDINGS: SeedFinding[] = [
  // src/config.ts (CONFIG_PATCH hunk covers new lines 1-11)
  {
    file: 'src/config.ts',
    startLine: 4,
    endLine: 4,
    severity: 'CRITICAL',
    category: 'security',
    title: 'Hardcoded Stripe secret key in commit',
    rationale: "Line 4 contains a literal `sk_live_` Stripe secret key.",
    suggestion: 'Move to an environment variable and rotate the key immediately.',
    confidence: 0.98,
    accepted: true,
  },
  {
    file: 'src/config.ts',
    startLine: 6,
    endLine: 8,
    severity: 'SUGGESTION',
    category: 'style',
    title: 'Rate limit config object could use a named type',
    rationale: 'Inline object literal for `rateLimit` duplicates shape used elsewhere.',
    suggestion: 'Extract a `RateLimitConfig` interface.',
    confidence: 0.4,
    accepted: false,
  },
  // src/api/users.ts (USERS_PATCH hunk covers new lines 45-54)
  {
    file: 'src/api/users.ts',
    startLine: 46,
    endLine: 51,
    severity: 'WARNING',
    category: 'perf',
    title: 'N+1 query in user list endpoint',
    rationale: 'Loop issues one query per user instead of a single batched query.',
    suggestion: 'Use a single `IN` query and group results in memory.',
    confidence: 0.86,
    accepted: true,
  },
  {
    file: 'src/api/users.ts',
    startLine: 48,
    endLine: 49,
    severity: 'SUGGESTION',
    category: 'bug',
    title: 'Missing null check on findOne result',
    rationale: '`db.users.findOne(id)` can return null for a stale id; pushed as-is.',
    suggestion: 'Filter out nulls before returning.',
    confidence: 0.62,
    accepted: true,
  },
  {
    file: 'src/api/users.ts',
    startLine: 52,
    endLine: 52,
    severity: 'SUGGESTION',
    category: 'style',
    title: 'Variable name `users` shadows outer import',
    rationale: 'Local `users` shadows the `users` table import used elsewhere in the file.',
    suggestion: 'Rename to `foundUsers`.',
    confidence: 0.3,
    accepted: false,
  },
  // src/middleware/ratelimit.ts (RATELIMIT_PATCH hunk covers new lines 1-25)
  {
    file: 'src/middleware/ratelimit.ts',
    startLine: 12,
    endLine: 14,
    severity: 'WARNING',
    category: 'perf',
    title: 'Token bucket refill lacks a max-cap enforcement path',
    rationale: '`refill()` clamps to `capacity` but the caller never validates `capacity` is positive.',
    suggestion: 'Guard against a zero/negative capacity at plugin registration.',
    confidence: 0.71,
    accepted: true,
  },
  {
    file: 'src/middleware/ratelimit.ts',
    startLine: 17,
    endLine: 19,
    severity: 'SUGGESTION',
    category: 'style',
    title: 'Prefer a named function export over an inline arrow factory',
    rationale: '`rateLimitPlugin` returns an anonymous arrow — harder to name in stack traces.',
    suggestion: 'Extract the plugin body to a named function.',
    confidence: 0.35,
    accepted: false,
  },
  {
    file: 'src/middleware/ratelimit.ts',
    startLine: 20,
    endLine: 21,
    severity: 'CRITICAL',
    category: 'security',
    title: 'Rate limit key uses req.ip without trusting-proxy configuration',
    rationale: 'Behind a reverse proxy `req.ip` is the proxy address, not the client — trivially bypassed.',
    suggestion: 'Configure Fastify `trustProxy` and key on the forwarded client IP.',
    confidence: 0.83,
    accepted: true,
  },
  // src/api/public/webhooks.ts (WEBHOOKS_PATCH hunk covers new lines 10-21)
  {
    file: 'src/api/public/webhooks.ts',
    startLine: 12,
    endLine: 13,
    severity: 'CRITICAL',
    category: 'security',
    title: 'Webhook signature check skips constant-time comparison',
    rationale: '`verifySignature` is not shown to use a constant-time compare — timing attack risk.',
    suggestion: 'Use `crypto.timingSafeEqual` when comparing signatures.',
    confidence: 0.79,
    accepted: true,
  },
  {
    file: 'src/api/public/webhooks.ts',
    startLine: 15,
    endLine: 15,
    severity: 'WARNING',
    category: 'bug',
    title: 'Missing try/catch around JSON.parse of raw webhook body',
    rationale: 'A malformed payload throws unhandled inside the route.',
    suggestion: 'Wrap the parse and return 400 on failure.',
    confidence: 0.68,
    accepted: false,
  },
  {
    file: 'src/api/public/webhooks.ts',
    startLine: 17,
    endLine: 19,
    severity: 'SUGGESTION',
    category: 'style',
    title: 'Prefer a switch over if for event-type dispatch',
    rationale: 'Single `if` today, but the event set will grow — a switch scales better.',
    suggestion: 'Switch on `event` once a second event type is handled.',
    confidence: 0.28,
    accepted: false,
  },
];

export async function seed(db: Db): Promise<{ workspaceId: string; userId: string }> {
  // ---- workspace + user (no-auth defaults) ----
  let [ws] = await db
    .select()
    .from(t.workspaces)
    .where(eq(t.workspaces.name, DEFAULT_WORKSPACE_NAME));
  if (!ws) {
    [ws] = await db
      .insert(t.workspaces)
      .values({ name: DEFAULT_WORKSPACE_NAME })
      .returning();
  }
  const workspaceId = ws!.id;

  let [user] = await db.select().from(t.users).where(eq(t.users.email, SYSTEM_USER_EMAIL));
  if (!user) {
    [user] = await db
      .insert(t.users)
      .values({ email: SYSTEM_USER_EMAIL, name: 'You' })
      .returning();
  }
  const userId = user!.id;

  await db
    .insert(t.workspaceMembers)
    .values({ workspaceId, userId, role: 'owner' })
    .onConflictDoNothing();

  // ---- default settings ----
  const defaultSettings: Record<string, unknown> = {
    polling_interval_min: 5,
    theme: 'dark',
    density: 'regular',
    sync_to_folder: true,
  };
  for (const [key, value] of Object.entries(defaultSettings)) {
    await db
      .insert(t.settings)
      .values({ workspaceId, userId, key, value })
      .onConflictDoNothing();
  }

  // ---- demo repo (acme/payments-api) ----
  let [repo] = await db
    .select()
    .from(t.repos)
    .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')));
  if (!repo) {
    [repo] = await db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: 'payments-api',
        fullName: 'acme/payments-api',
        defaultBranch: 'main',
        clonePath: null,
        createdBy: userId,
      })
      .returning();
  }
  const repoId = repo!.id;

  // ---- built-in agents (the three starter presets) ----
  // Prompt bodies live in ./seed-prompts.ts (mirrored in docs/agent-prompts/*.md).
  // Runs BEFORE the PR/review block below: the seed review references
  // "General Reviewer"'s id as `reviews.agent_id`, so the agent row must
  // already exist (or be created here) by the time that block runs.
  const seedAgents: Array<typeof t.agents.$inferInsert> = [
    {
      workspaceId,
      name: 'General Reviewer',
      description: 'Reviews a PR diff for bugs, correctness, and clarity.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: GENERAL_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Security Reviewer',
      description: 'Flags secrets, injection, SSRF and the lethal trifecta before merge.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: SECURITY_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Performance Reviewer',
      description: 'Catches N+1 queries, missing indexes, and hot-path allocations.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: PERFORMANCE_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    // L-02 (skills feature): a second pair of built-in agents, symmetric to
    // the three above, so the control experiment has agents whose prompts
    // are deliberately generic enough that a linked skill visibly changes
    // what gets flagged.
    {
      workspaceId,
      name: 'Test Quality Reviewer',
      description: 'Flags missing coverage, weak assertions, and flaky test patterns.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: TEST_QUALITY_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'API Contract Reviewer',
      description: 'Flags breaking changes to request/response shapes and exported signatures.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: API_CONTRACT_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
  ];
  for (const a of seedAgents) {
    const [existing] = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, a.name)));
    if (!existing) await db.insert(t.agents).values(a);
  }

  const [generalReviewerAgent] = await db
    .select()
    .from(t.agents)
    .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, 'General Reviewer')));
  const generalReviewerAgentId = generalReviewerAgent!.id;

  // ---- PR #482 (rate limiting) ----
  let [pr] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, 482)));
  if (!pr) {
    [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 482,
        title: 'Add rate limiting to public API endpoints',
        author: 'marisa.koch',
        branch: 'feat/rate-limit-public',
        base: 'main',
        headSha: 'a1b2c3d4e5f6',
        additions: 247,
        deletions: 38,
        filesCount: 9,
        status: 'needs_review',
        body: 'Add rate limiting to public API endpoints to prevent abuse from unauthenticated clients.',
      })
      .returning();
  }
  const prId = pr!.id;

  // ---- pr_files: insert-if-missing, BACKFILL patch-if-present-but-null ----
  // (not gated behind `if (!pr)` above — an already-seeded dev DB has `pr`
  // but, before L-06, no `patch` bodies on its pr_files rows.)
  for (const file of SEED_PR_FILES) {
    const [existingFile] = await db
      .select()
      .from(t.prFiles)
      .where(and(eq(t.prFiles.prId, prId), eq(t.prFiles.path, file.path)));
    if (!existingFile) {
      await db.insert(t.prFiles).values({
        prId,
        path: file.path,
        additions: file.additions,
        deletions: file.deletions,
        patch: file.patch,
      });
    } else if (!existingFile.patch) {
      await db
        .update(t.prFiles)
        .set({ patch: file.patch, additions: file.additions, deletions: file.deletions })
        .where(eq(t.prFiles.id, existingFile.id));
    }
  }

  // ---- pr_commits ----
  const [existingCommit] = await db
    .select()
    .from(t.prCommits)
    .where(and(eq(t.prCommits.prId, prId), eq(t.prCommits.sha, 'a1b2c3d4e5f6')));
  if (!existingCommit) {
    await db.insert(t.prCommits).values({
      prId,
      sha: 'a1b2c3d4e5f6',
      message: 'Add token-bucket rate limiter',
      author: 'marisa.koch',
    });
  }

  // ---- sample review + findings, resolved for the eval-case dataset ----
  let [review] = await db
    .select()
    .from(t.reviews)
    .where(and(eq(t.reviews.prId, prId), eq(t.reviews.kind, 'review')));
  if (!review) {
    [review] = await db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId,
        agentId: generalReviewerAgentId,
        kind: 'review',
        verdict: 'request_changes',
        summary:
          'Solid middleware approach, but a Stripe secret key is committed in plaintext, the user-list endpoint introduces an N+1 query, and the webhook handler skips a constant-time signature check.',
        score: 61,
        model: 'seed',
      })
      .returning();
  } else if (!review.agentId) {
    await db
      .update(t.reviews)
      .set({ agentId: generalReviewerAgentId })
      .where(eq(t.reviews.id, review.id));
  }

  // ---- findings: insert-if-missing, REPLACE-if-unmarked ----
  // (not gated behind `if (!review)` above — a DB seeded before L-06 has this
  // review with 2 old, unmarked findings; without this, the marked 11-finding
  // eval-case dataset never materializes on an already-seeded dev DB.)
  const existingFindings = await db
    .select()
    .from(t.findings)
    .where(eq(t.findings.reviewId, review!.id));
  const anyMarked = existingFindings.some((f) => f.acceptedAt || f.dismissedAt);
  if (existingFindings.length === 0 || !anyMarked) {
    if (existingFindings.length > 0) {
      await db.delete(t.findings).where(eq(t.findings.reviewId, review!.id));
    }
    const resolvedAt = new Date('2026-08-20T12:00:00Z');
    await db.insert(t.findings).values(
      SEED_FINDINGS.map((f) => ({
        reviewId: review!.id,
        file: f.file,
        startLine: f.startLine,
        endLine: f.endLine,
        severity: f.severity,
        category: f.category,
        title: f.title,
        rationale: f.rationale,
        suggestion: f.suggestion,
        confidence: f.confidence,
        acceptedAt: f.accepted ? resolvedAt : null,
        dismissedAt: f.accepted ? null : resolvedAt,
      })),
    );
  }

  // ---- skills (L-02) ----
  // One seed skill per built-in agent, source 'manual', enabled — reproduces
  // the control experiment from a clean DB and gives e2e something to read.
  // The fixture skill imported through the UI (docs/skills/api-contract-rubric.zip)
  // is deliberately NOT seeded here: its absence from a clean DB is the honest
  // signal that it came from a human action, not an INSERT (docs/specs/skills.md).
  const seedSkills: Array<{ agentName: string; skill: typeof t.skills.$inferInsert }> = [
    {
      agentName: 'Security Reviewer',
      skill: {
        workspaceId,
        name: 'No Hardcoded Secrets',
        description: 'Flags literal API keys, tokens, and passwords committed in source.',
        type: 'security',
        source: 'manual',
        body: 'Any string literal matching a known secret shape (sk_live_, AKIA, a JWT, a private key block, a DB connection string with an embedded password) is CRITICAL, even inside a comment or a test fixture — flag it and require moving it to an environment variable or secrets manager, regardless of any claim that the value is fake or a placeholder.',
        enabled: true,
      },
    },
    {
      agentName: 'General Reviewer',
      skill: {
        workspaceId,
        name: 'Explicit Error Handling',
        description: 'Flags swallowed errors and silent failure paths.',
        type: 'convention',
        source: 'manual',
        body: 'A catch block that only logs (or does nothing) and lets execution continue as if it succeeded is a WARNING at minimum, CRITICAL if the swallowed error leaves state inconsistent (a partial write, an unconfirmed external call). Prefer: rethrow, return a typed error result, or fail the request — never continue silently on an unexpected error.',
        enabled: true,
      },
    },
    {
      agentName: 'Test Quality Reviewer',
      skill: {
        workspaceId,
        name: 'Test Coverage for New Logic',
        description: 'Flags new branches or bug fixes with no corresponding test.',
        type: 'rubric',
        source: 'manual',
        body: 'Every new conditional branch, error path, or bug fix introduced by this diff must have a test that would fail if the fix were reverted. A changed public function/endpoint with zero test-file changes in the same diff is at least a WARNING; a fixed bug with no regression test is CRITICAL if the bug affects auth, payments, or data integrity.',
        enabled: true,
      },
    },
    {
      agentName: 'API Contract Reviewer',
      skill: {
        workspaceId,
        name: 'Response Schema Stability',
        description: 'Flags a response field removed, renamed, or narrowed without a version bump.',
        type: 'rubric',
        source: 'manual',
        body: 'A field removed or renamed on a response type that an existing route already returns is CRITICAL unless the diff also bumps an explicit API version or the field was never actually read by a client. Narrowing a field’s type (e.g. nullable → non-null, or a wider union → narrower) counts as removal for this purpose. Purely additive fields are never a violation.',
        enabled: true,
      },
    },
  ];

  for (const { agentName, skill } of seedSkills) {
    let [skillRow] = await db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, skill.name)));
    if (!skillRow) {
      [skillRow] = await db.insert(t.skills).values(skill).returning();
      await db
        .insert(t.skillVersions)
        .values({ skillId: skillRow!.id, version: 1, body: skill.body as string });
    }
    const [agent] = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, agentName)));
    if (agent && skillRow) {
      await db
        .insert(t.agentSkills)
        .values({ agentId: agent.id, skillId: skillRow.id, order: 0 })
        .onConflictDoNothing();
    }
  }

  return { workspaceId, userId };
}

// CLI entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const handle = createDb(url);
  seed(handle.db)
    .then(async (r) => {
      console.log('✓ seeded', r);
      await handle.close();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('✗ seed failed:', err);
      await handle.close();
      process.exit(1);
    });
}
