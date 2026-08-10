import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/index.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills-import] Docker not available — skipping integration tests.');
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ZIP = resolve(__dirname, '../../docs/skills/api-contract-rubric.zip');

/**
 * The CI-repeatable proof half of docs/specs/skills.md's "nothing executable
 * ran" claim: posts the REAL fixture bytes (SKILL.md + README.md + a decoy
 * install.sh) to /skills/import/preview then /skills, and asserts the created
 * row plus ignored_entries — mirroring the human demonstration (upload once,
 * see install.sh listed as ignored, confirm).
 */
d('skills import (fixture archive)', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  it('preview → create on the real fixture bytes; ignored_entries contains install.sh', async () => {
    const app = await makeApp();
    const content_base64 = readFileSync(FIXTURE_ZIP).toString('base64');

    const preview = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'api-contract-rubric.zip', content_base64 },
    });
    expect(preview.statusCode).toBe(200);
    const body = preview.json();

    expect(body.draft).toMatchObject({
      name: 'API Contract Rubric',
      type: 'rubric',
      source: 'extracted',
    });
    expect(body.draft.body).toContain('Check every changed HTTP handler');
    expect(body.ignored_entries).toContainEqual({
      path: 'install.sh',
      reason: 'not a recognised text/markdown file',
    });

    const created = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: {
        name: body.draft.name,
        description: body.draft.description,
        type: body.draft.type,
        source: body.draft.source,
        body: body.draft.body,
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ name: 'API Contract Rubric', type: 'rubric', version: 1 });
    await app.close();
  });

  it('a plain .md upload (no archive) previews the same way', async () => {
    const app = await makeApp();
    const md = '---\nname: Solo Skill\ntype: convention\n---\nOne rule.';
    const content_base64 = Buffer.from(md, 'utf8').toString('base64');

    const preview = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'solo-skill.md', content_base64 },
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toEqual({
      draft: {
        name: 'Solo Skill',
        description: 'One rule.',
        type: 'convention',
        source: 'extracted',
        body: 'One rule.',
      },
      ignored_entries: [],
      warnings: [],
    });
    await app.close();
  });

  it('rejects a body over the 1MB app-wide cap on every OTHER route (bodyLimit is per-route)', async () => {
    const app = await makeApp();
    // /skills has no bodyLimit override — the app-wide 1MB cap applies.
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: {
        name: 'x',
        description: 'd',
        type: 'custom',
        source: 'manual',
        body: 'y'.repeat(1_100_000),
      },
    });
    expect(res.statusCode).toBe(413);
    await app.close();
  });
});
