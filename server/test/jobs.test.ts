import { describe, it, expect, vi } from 'vitest';
import { JobRunner } from '../src/platform/jobs.js';
import type { Db } from '../src/db/client.js';

function stubDb(): Db {
  return {
    insert: () => ({
      values: () => ({ returning: async () => [{ id: 'job-1' }] }),
    }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  } as unknown as Db;
}

const settle = () => new Promise((r) => setTimeout(r, 50));

describe('JobRunner — a failing job must not crash the process', () => {
  it('does not emit unhandledRejection when nobody awaits `done`', async () => {
    const onUnhandled = vi.fn();
    process.on('unhandledRejection', onUnhandled);
    try {
      const jobs = new JobRunner(stubDb(), { retries: 0, timeoutMs: 1000 });
      jobs.register('boom', async () => {
        throw new Error('deadlock detected');
      });

      const { id } = await jobs.enqueue('ws-1', 'boom', {});
      expect(id).toBe('job-1');

      await jobs.onIdle();
      await settle();

      expect(onUnhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('still rejects `done` for a caller that does await it', async () => {
    const jobs = new JobRunner(stubDb(), { retries: 0, timeoutMs: 1000 });
    jobs.register('boom', async () => {
      throw new Error('deadlock detected');
    });

    const { done } = await jobs.enqueue('ws-1', 'boom', {});
    await expect(done).rejects.toThrow('deadlock detected');
  });

  it('resolves `done` on success', async () => {
    const jobs = new JobRunner(stubDb(), { retries: 0, timeoutMs: 1000 });
    const handler = vi.fn(async () => undefined);
    jobs.register('ok', handler);

    const { done } = await jobs.enqueue('ws-1', 'ok', { a: 1 });
    await expect(done).resolves.toBeUndefined();
    expect(handler).toHaveBeenCalledOnce();
  });
});
