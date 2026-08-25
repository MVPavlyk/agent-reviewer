import { readFile } from 'node:fs/promises';
import type { RunnerBundle } from '../../modules/ci/service.js';

/**
 * Reads the already-built `agent-runner/dist/index.js` off a configured local
 * path (`AppConfig.runnerBundlePath`, default `agent-runner/dist/index.js`
 * from the repo root — `platform/config.ts`). This adapter deliberately does
 * NOT build the bundle — building `agent-runner` is out of scope for this
 * feature (see `.devdigest/plan-export-to-ci.md`); a missing file just means
 * "not built yet", surfaced as `null` so the service can turn it into a 5xx.
 */
export class LocalRunnerBundle implements RunnerBundle {
  constructor(private bundlePath: string) {}

  async read(): Promise<string | null> {
    try {
      return await readFile(this.bundlePath, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }
}
