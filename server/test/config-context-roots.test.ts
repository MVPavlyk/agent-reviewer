import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/platform/config.js';

const BASE_ENV: NodeJS.ProcessEnv = {
  DATABASE_URL: 'postgres://devdigest:devdigest@localhost:5432/devdigest',
};

describe('loadConfig — CONTEXT_DOC_ROOTS', () => {
  it('defaults to specs, docs, insights when unset', () => {
    const config = loadConfig({ ...BASE_ENV });
    expect(config.contextDocRoots).toEqual(['specs', 'docs', 'insights']);
  });

  it('parses a comma-separated custom list, trimming and dropping empties', () => {
    const config = loadConfig({ ...BASE_ENV, CONTEXT_DOC_ROOTS: 'a, b ,' });
    expect(config.contextDocRoots).toEqual(['a', 'b']);
  });

  it('discards a segment containing ".." as an invalid relative path component', () => {
    const config = loadConfig({ ...BASE_ENV, CONTEXT_DOC_ROOTS: 'specs,../x,docs' });
    expect(config.contextDocRoots).toEqual(['specs', 'docs']);
  });

  it('discards segments containing a path separator', () => {
    const config = loadConfig({ ...BASE_ENV, CONTEXT_DOC_ROOTS: 'specs,a/b,c\\d,docs' });
    expect(config.contextDocRoots).toEqual(['specs', 'docs']);
  });

  it('falls back to the default when every provided segment is invalid', () => {
    const config = loadConfig({ ...BASE_ENV, CONTEXT_DOC_ROOTS: '../x,..' });
    expect(config.contextDocRoots).toEqual(['specs', 'docs', 'insights']);
  });
});
