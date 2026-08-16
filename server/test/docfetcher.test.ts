/**
 * Intent Layer — DocFetcher SSRF guards. The URL is fully attacker-controlled
 * (extracted from a PR body), so every guard here is a security boundary, not
 * a nicety — see the Intent Layer plan's Risks §2.
 */
import { describe, it, expect } from 'vitest';
import { HttpDocFetcher } from '../src/adapters/docfetcher/http.js';

describe('HttpDocFetcher (SSRF guards)', () => {
  const fetcher = new HttpDocFetcher();

  it('refuses non-https URLs', async () => {
    await expect(fetcher.fetch('http://example.com/plan.md')).rejects.toThrow(/https/i);
  });

  it('refuses loopback/private IPv4 literals before any network call', async () => {
    await expect(fetcher.fetch('https://127.0.0.1/plan.md')).rejects.toThrow(/private|reserved/i);
    await expect(fetcher.fetch('https://10.0.0.5/plan.md')).rejects.toThrow(/private|reserved/i);
    await expect(fetcher.fetch('https://192.168.1.1/plan.md')).rejects.toThrow(/private|reserved/i);
    await expect(fetcher.fetch('https://169.254.169.254/latest/meta-data/')).rejects.toThrow(/private|reserved/i);
  });

  it('refuses loopback/unique-local IPv6 literals', async () => {
    await expect(fetcher.fetch('https://[::1]/plan.md')).rejects.toThrow(/private|reserved/i);
    await expect(fetcher.fetch('https://[fd00::1]/plan.md')).rejects.toThrow(/private|reserved/i);
  });

  it('refuses an invalid URL without throwing an unhandled type error', async () => {
    await expect(fetcher.fetch('not-a-url')).rejects.toThrow(/invalid url/i);
  });
});
