import { describe, it, expect } from 'vitest';
import { normalizeContextDocPath } from '../src/modules/context-docs/helpers.js';

describe('normalizeContextDocPath', () => {
  it('accepts a plain relative .md path', () => {
    expect(normalizeContextDocPath('specs/foo.md')).toBe('specs/foo.md');
  });

  it('accepts case-insensitive .MD extension', () => {
    expect(normalizeContextDocPath('docs/README.MD')).toBe('docs/README.MD');
  });

  it('normalizes a redundant ./ segment', () => {
    expect(normalizeContextDocPath('specs/./foo.md')).toBe('specs/foo.md');
  });

  it('rejects a leading ../ traversal', () => {
    expect(normalizeContextDocPath('../secrets.md')).toBeNull();
  });

  it('rejects a traversal buried in the middle of the path', () => {
    expect(normalizeContextDocPath('specs/../../etc/passwd.md')).toBeNull();
  });

  it('rejects an absolute path', () => {
    expect(normalizeContextDocPath('/etc/passwd.md')).toBeNull();
  });

  it('rejects an embedded NUL byte', () => {
    expect(normalizeContextDocPath('specs/foo.md\0.txt')).toBeNull();
  });

  it('rejects a non-.md file', () => {
    expect(normalizeContextDocPath('specs/foo.txt')).toBeNull();
  });

  it('rejects a Windows-style separator', () => {
    expect(normalizeContextDocPath('specs\\foo.md')).toBeNull();
  });

  it('rejects an empty string', () => {
    expect(normalizeContextDocPath('')).toBeNull();
  });

  it('rejects non-string input', () => {
    expect(normalizeContextDocPath(undefined)).toBeNull();
    expect(normalizeContextDocPath(42)).toBeNull();
  });
});
