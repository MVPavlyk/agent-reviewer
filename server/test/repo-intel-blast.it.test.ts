/**
 * Persistent blast path against real Postgres — R15: `tryPersistentBlast`
 * had never executed against a real database before this feature. Seeds
 * `repo_index_state` / `symbols` / `references` / `file_edges` / `file_facts`
 * / `file_rank` directly (no indexer pipeline run).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';
import { normalizeChangedPaths } from '../src/modules/blast/blast-paths.js';
import { INDEXER_VERSION } from '../src/modules/repo-intel/constants.js';
import type { Container } from '../src/platform/container.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

function fakeContainer(pg: PgFixture, opts?: { repoIntelEnabled?: boolean }): Container {
  return {
    config: { repoIntelEnabled: opts?.repoIntelEnabled ?? true },
    db: pg.handle.db,
    codeIndex: {
      symbols: async () => {
        throw new Error('codeIndex.symbols must not be called on the source:"index" path');
      },
      references: async () => {
        throw new Error('codeIndex.references must not be called on the source:"index" path');
      },
    },
  } as unknown as Container;
}

let repoSeq = 0;
async function makeRepo(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `blast-it-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  return repo!;
}

async function setIndexState(
  db: PgFixture['handle']['db'],
  repoId: string,
  over: Partial<typeof t.repoIndexState.$inferInsert> = {},
) {
  await db.insert(t.repoIndexState).values({
    repoId,
    lastIndexedSha: 'sha1',
    indexerVersion: INDEXER_VERSION,
    status: 'full',
    filesIndexed: 10,
    filesSkipped: 0,
    ...over,
  });
}

d('RepoIntelService.getBlastRadius — persistent path (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('1. happy path: changed symbols -> callers sorted by rank desc, status ok', async () => {
    const repo = await makeRepo(pg.handle.db, workspaceId);
    await setIndexState(pg.handle.db, repo.id);
    await pg.handle.db.insert(t.symbols).values([
      { repoId: repo.id, path: 'src/a.ts', name: 'rateLimit', kind: 'function', line: 1, exported: true },
    ]);
    await pg.handle.db.insert(t.references).values([
      { repoId: repo.id, fromPath: 'src/low.ts', toSymbol: 'rateLimit', line: 5, declFile: 'src/a.ts' },
      { repoId: repo.id, fromPath: 'src/high.ts', toSymbol: 'rateLimit', line: 9, declFile: 'src/a.ts' },
    ]);
    await pg.handle.db.insert(t.fileRank).values([
      { repoId: repo.id, filePath: 'src/low.ts', pagerank: 0.1, hotness: 0, rank: 0.1, percentile: 10 },
      { repoId: repo.id, filePath: 'src/high.ts', pagerank: 0.9, hotness: 0, rank: 0.9, percentile: 90 },
    ]);

    const svc = new RepoIntelService(fakeContainer(pg));
    const result = await svc.getBlastRadius(repo.id, ['src/a.ts'], { source: 'index' });
    expect(result.status).toBe('ok');
    expect(result.changedSymbols).toEqual([{ file: 'src/a.ts', name: 'rateLimit', kind: 'function' }]);
    expect(result.callers.map((c) => c.file)).toEqual(['src/high.ts', 'src/low.ts']);
  });

  it('2. empty file_rank -> callers survive with rank 0, status partial/rank_missing', async () => {
    const repo = await makeRepo(pg.handle.db, workspaceId);
    await setIndexState(pg.handle.db, repo.id);
    await pg.handle.db.insert(t.symbols).values([
      { repoId: repo.id, path: 'src/a.ts', name: 'rateLimit', kind: 'function', line: 1, exported: true },
    ]);
    await pg.handle.db.insert(t.references).values([
      { repoId: repo.id, fromPath: 'src/caller.ts', toSymbol: 'rateLimit', line: 5, declFile: 'src/a.ts' },
    ]);
    // No file_rank rows at all.

    const svc = new RepoIntelService(fakeContainer(pg));
    const result = await svc.getBlastRadius(repo.id, ['src/a.ts'], { source: 'index' });
    expect(result.callers).toHaveLength(1);
    expect(result.callers[0]!.rank).toBe(0);
    expect(result.status).toBe('partial');
    expect(result.reason).toBe('rank_missing');
  });

  it('3. per-symbol clamp against real rows: 25+25 references -> 20+20', async () => {
    const repo = await makeRepo(pg.handle.db, workspaceId);
    await setIndexState(pg.handle.db, repo.id);
    await pg.handle.db.insert(t.symbols).values([
      { repoId: repo.id, path: 'src/a.ts', name: 'symA', kind: 'function', line: 1, exported: true },
      { repoId: repo.id, path: 'src/a.ts', name: 'symB', kind: 'function', line: 10, exported: true },
    ]);
    const refRows = [];
    const rankRows = [];
    for (let i = 0; i < 25; i++) {
      refRows.push({
        repoId: repo.id,
        fromPath: `src/callerA${i}.ts`,
        toSymbol: 'symA',
        line: 1,
        declFile: 'src/a.ts',
      });
      rankRows.push({
        repoId: repo.id,
        filePath: `src/callerA${i}.ts`,
        pagerank: i,
        hotness: 0,
        rank: i,
        percentile: i,
      });
    }
    for (let i = 0; i < 25; i++) {
      refRows.push({
        repoId: repo.id,
        fromPath: `src/callerB${i}.ts`,
        toSymbol: 'symB',
        line: 1,
        declFile: 'src/a.ts',
      });
      rankRows.push({
        repoId: repo.id,
        filePath: `src/callerB${i}.ts`,
        pagerank: i,
        hotness: 0,
        rank: i,
        percentile: i,
      });
    }
    await pg.handle.db.insert(t.references).values(refRows);
    await pg.handle.db.insert(t.fileRank).values(rankRows);

    const svc = new RepoIntelService(fakeContainer(pg));
    const result = await svc.getBlastRadius(repo.id, ['src/a.ts'], { source: 'index' });
    expect(result.callersBySymbol.symA!.rows).toHaveLength(20);
    expect(result.callersBySymbol.symA!.total).toBe(25);
    expect(result.callersBySymbol.symA!.truncated).toBe(true);
    expect(result.callersBySymbol.symB!.rows).toHaveLength(20);
    expect(result.callersBySymbol.symB!.total).toBe(25);
    expect(result.coverage.callersTruncated).toBe(true);
  });

  it('4. reverse BFS: a<-b<-c<-d, endpoint on c (depth 2) present, cron on d (depth 3) absent', async () => {
    const repo = await makeRepo(pg.handle.db, workspaceId);
    await setIndexState(pg.handle.db, repo.id);
    await pg.handle.db.insert(t.symbols).values([
      { repoId: repo.id, path: 'a.ts', name: 'coreFn', kind: 'function', line: 1, exported: true },
    ]);
    await pg.handle.db.insert(t.fileEdges).values([
      { repoId: repo.id, fromFile: 'b.ts', toFile: 'a.ts' },
      { repoId: repo.id, fromFile: 'c.ts', toFile: 'b.ts' },
      { repoId: repo.id, fromFile: 'd.ts', toFile: 'c.ts' },
    ]);
    await pg.handle.db.insert(t.fileFacts).values([
      { repoId: repo.id, filePath: 'c.ts', endpoints: ['GET /api/x'], crons: [] },
      { repoId: repo.id, filePath: 'd.ts', endpoints: [], crons: ['nightly-job'] },
    ]);

    const svc = new RepoIntelService(fakeContainer(pg));
    const result = await svc.getBlastRadius(repo.id, ['a.ts'], { source: 'index' });
    const endpointValues = result.endpoints.map((e) => e.value);
    expect(endpointValues).toContain('GET /api/x');
    const ep = result.endpoints.find((e) => e.value === 'GET /api/x')!;
    expect(ep.depth).toBe(2);
    expect(ep.file).toBe('c.ts');
    expect(result.crons.map((c) => c.value)).not.toContain('nightly-job');
  });

  it('5. stale indexerVersion -> degraded/index_stale, empty arrays', async () => {
    const repo = await makeRepo(pg.handle.db, workspaceId);
    await setIndexState(pg.handle.db, repo.id, { indexerVersion: 1 });
    await pg.handle.db.insert(t.symbols).values([
      { repoId: repo.id, path: 'src/a.ts', name: 'rateLimit', kind: 'function', line: 1, exported: true },
    ]);

    const svc = new RepoIntelService(fakeContainer(pg));
    const result = await svc.getBlastRadius(repo.id, ['src/a.ts'], { source: 'index' });
    expect(result.status).toBe('degraded');
    expect(result.reason).toBe('index_stale');
    expect(result.changedSymbols).toEqual([]);
    expect(result.callers).toEqual([]);
  });

  it('6. paths: normalizeChangedPaths bridges GitHub-style "./src/a.ts" to index "src/a.ts"', async () => {
    const repo = await makeRepo(pg.handle.db, workspaceId);
    await setIndexState(pg.handle.db, repo.id);
    await pg.handle.db.insert(t.symbols).values([
      { repoId: repo.id, path: 'src/a.ts', name: 'rateLimit', kind: 'function', line: 1, exported: true },
    ]);

    const svc = new RepoIntelService(fakeContainer(pg));
    const withoutNormalization = await svc.getBlastRadius(repo.id, ['./src/a.ts'], { source: 'index' });
    expect(withoutNormalization.changedSymbols).toEqual([]); // fails to match — proves the test isn't a no-op

    const normalized = normalizeChangedPaths(['./src/a.ts']);
    expect(normalized).toEqual(['src/a.ts']);
    const withNormalization = await svc.getBlastRadius(repo.id, normalized, { source: 'index' });
    expect(withNormalization.changedSymbols).toEqual([{ file: 'src/a.ts', name: 'rateLimit', kind: 'function' }]);
  });

  it('7. unsupported language -> degraded/unsupported_files, never a bare ok', async () => {
    const repo = await makeRepo(pg.handle.db, workspaceId);
    await setIndexState(pg.handle.db, repo.id);

    const svc = new RepoIntelService(fakeContainer(pg));
    const result = await svc.getBlastRadius(repo.id, ['main.py', 'server.go'], { source: 'index' });
    expect(result.status).toBe('degraded');
    expect(result.reason).toBe('unsupported_files');
    expect(result.message.length).toBeGreaterThan(0);
  });

  it('8. flag off -> reason flag_off, codeIndex never touched', async () => {
    const repo = await makeRepo(pg.handle.db, workspaceId);
    const svc = new RepoIntelService(fakeContainer(pg, { repoIntelEnabled: false }));
    const result = await svc.getBlastRadius(repo.id, ['src/a.ts'], { source: 'index' });
    expect(result.status).toBe('degraded');
    expect(result.reason).toBe('flag_off');
    // codeIndex.symbols/references throw if called — getting here without throwing proves it wasn't.
  });
});
