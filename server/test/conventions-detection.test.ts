/**
 * ConventionsService.runDetectionJob / rescan — pipeline WIRING tests.
 *
 * Stubs `container.repoIntel`, `container.llm` (MockLLMProvider, which
 * validates a fixture against the passed zod schema exactly like a real
 * `completeStructured` call), and `container.conventionsRepo` (no DB).
 * Mirrors `repo-intel-resync.test.ts`'s stubbed-service style.
 */
import { describe, it, expect } from 'vitest';
import { ConventionsService } from '../src/modules/conventions/service.js';
import { MockLLMProvider } from '../src/adapters';
import type { ConventionsRepository, ConventionScanRow } from '../src/modules/conventions/repository.js';
import type { RepoIntel } from '../src/modules/repo-intel';
import type { Container } from '../src/platform/container.js';

interface Calls {
  deletePending: number;
  insertMany: Record<string, unknown>[];
  updateScan: { scanId: string; patch: Record<string, unknown> }[];
}

function makeService(opts: {
  repoIntel: Partial<RepoIntel>;
  llmStructured?: unknown;
  nonPending?: { title: string; rule: string; status: 'accepted' | 'rejected' }[];
}) {
  const calls: Calls = { deletePending: 0, insertMany: [], updateScan: [] };

  const repo = {
    nonPendingByRepo: async () => opts.nonPending ?? [],
    deletePending: async () => {
      calls.deletePending += 1;
    },
    insertMany: async (rows: Record<string, unknown>[]) => {
      calls.insertMany = rows;
      return rows.map((r, i) => ({ id: `new-${i}`, ...r }));
    },
    updateScan: async (scanId: string, patch: Record<string, unknown>) => {
      calls.updateScan.push({ scanId, patch });
    },
  } as unknown as ConventionsRepository;

  const llm = new MockLLMProvider('openai', {
    structured: opts.llmStructured ?? { conventions: [] },
  });

  const container = {
    conventionsRepo: repo,
    repoIntel: opts.repoIntel as RepoIntel,
    llm: async () => llm,
  } as unknown as Container;

  const service = new ConventionsService(container);
  return { service, calls, llm };
}

describe('ConventionsService.runDetectionJob', () => {
  it('wires repo-intel samples → file contents → LLM → persisted rows, and marks the scan done', async () => {
    const { service, calls, llm } = makeService({
      repoIntel: {
        getConventionSamples: async () => ['src/api/users.ts'],
        getFileContents: async () => [
          { path: 'src/api/users.ts', content: 'export const x = 1;' },
        ],
      },
      llmStructured: {
        conventions: [
          {
            title: 'Result type',
            rule: 'Handlers return Result<T>.',
            file: 'src/api/users.ts',
            start_line: 1,
            end_line: 1,
            snippet: 'export const x = 1;',
            confidence: 0.9,
          },
        ],
      },
    });

    await service.runDetectionJob('ws1', 'r1', 'scan1');

    expect(calls.deletePending).toBe(1);
    expect(calls.insertMany).toHaveLength(1);
    expect(calls.insertMany[0]).toMatchObject({
      title: 'Result type',
      evidencePath: 'src/api/users.ts',
    });
    expect(llm.calls.map((c) => c.method)).toContain('completeStructured');
    const last = calls.updateScan.at(-1);
    expect(last?.patch).toMatchObject({ status: 'done', sampleFileCount: 1, candidateCount: 1 });
  });

  it('drops a result whose file is not in the sampled set (no hallucinated paths)', async () => {
    const { service, calls } = makeService({
      repoIntel: {
        getConventionSamples: async () => ['src/api/users.ts'],
        getFileContents: async () => [{ path: 'src/api/users.ts', content: 'x' }],
      },
      llmStructured: {
        conventions: [
          {
            title: 'Made up',
            rule: 'r',
            file: 'src/not-sampled.ts',
            start_line: 1,
            end_line: 1,
            snippet: 's',
            confidence: 0.5,
          },
        ],
      },
    });

    await service.runDetectionJob('ws1', 'r1', 'scan1');

    expect(calls.insertMany).toHaveLength(0);
  });

  it('marks the scan failed (never "done" with zero) when no sample files are available', async () => {
    const { service, calls } = makeService({
      repoIntel: {
        getConventionSamples: async () => [],
        getFileContents: async () => [],
      },
    });

    await service.runDetectionJob('ws1', 'r1', 'scan1');

    const last = calls.updateScan.at(-1);
    expect(last?.patch).toMatchObject({ status: 'failed', error: 'no sample files available' });
    expect(calls.deletePending).toBe(0);
  });

  it('includes already-decided conventions in the exclusion digest sent to the LLM', async () => {
    const { service, llm } = makeService({
      repoIntel: {
        getConventionSamples: async () => ['a.ts'],
        getFileContents: async () => [{ path: 'a.ts', content: 'x' }],
      },
      nonPending: [{ title: 'Old rule', rule: 'Already decided.', status: 'accepted' }],
    });

    await service.runDetectionJob('ws1', 'r1', 'scan1');

    const call = llm.calls.find((c) => c.method === 'completeStructured');
    const userMessage = (
      call!.req as { messages: { role: string; content: string }[] }
    ).messages.find((m) => m.role === 'user');
    expect(userMessage?.content).toContain('Old rule');
    expect(userMessage?.content).toContain('[accepted]');
  });
});

describe('ConventionsService.rescan', () => {
  it('returns the existing scan id instead of enqueueing a second job when one is already running', async () => {
    const runningScan = { id: 'running-1' } as ConventionScanRow;
    const enqueueCalls: unknown[] = [];
    const repo = {
      getRunningScan: async () => runningScan,
    } as unknown as ConventionsRepository;
    const container = {
      conventionsRepo: repo,
      jobs: {
        enqueue: async (...args: unknown[]) => {
          enqueueCalls.push(args);
          return { id: 'job-1', done: Promise.resolve() };
        },
      },
    } as unknown as Container;

    const service = new ConventionsService(container);
    const result = await service.rescan('ws1', 'r1');

    expect(result).toEqual({ status: 'accepted', job_id: null, scan_id: 'running-1' });
    expect(enqueueCalls).toHaveLength(0);
  });

  it('inserts a new scan and enqueues a job when none is running', async () => {
    const enqueueCalls: unknown[] = [];
    const repo = {
      getRunningScan: async () => undefined,
      insertScan: async () => ({ id: 'scan-2' }) as ConventionScanRow,
    } as unknown as ConventionsRepository;
    const container = {
      conventionsRepo: repo,
      jobs: {
        enqueue: async (...args: unknown[]) => {
          enqueueCalls.push(args);
          return { id: 'job-2', done: Promise.resolve() };
        },
      },
    } as unknown as Container;

    const service = new ConventionsService(container);
    const result = await service.rescan('ws1', 'r1');

    expect(result).toEqual({ status: 'accepted', job_id: 'job-2', scan_id: 'scan-2' });
    expect(enqueueCalls).toHaveLength(1);
  });
});
