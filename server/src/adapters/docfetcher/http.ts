import { lookup } from 'node:dns/promises';
import { isIPv4, isIPv6 } from 'node:net';
import type { DocFetcher, DocFetchResult } from '@devdigest/shared';

/**
 * Fetches a plan/spec doc whose URL came from a PR body — fully
 * attacker-controlled input. See `@devdigest/shared`'s `DocFetcher` doc
 * comment for the guard list; each one is implemented below and none may be
 * removed without re-reading the SSRF risk in the Intent Layer plan.
 */

export class DocFetchError extends Error {}

const TIMEOUT_MS = 5000;
const MAX_BYTES = 512 * 1024;
const MAX_REDIRECTS = 2;
const ALLOWED_CONTENT_TYPES = ['text/plain', 'text/markdown', 'text/html'];

/** IPv4 ranges that must never be fetched: loopback, link-local, private,
 *  CGNAT, documentation/test-net, multicast, reserved, broadcast. */
function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return true;
  const a = parts[0] ?? 0;
  const b = parts[1] ?? 0;
  if (a === 127) return true; // loopback
  if (a === 10) return true; // private
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 169 && b === 254) return true; // link-local
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 0) return true; // "this network"
  if (a === 192 && b === 0) return true; // IETF protocol assignments / TEST-NET-ish
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && b === 51) return true; // TEST-NET-2
  if (a === 203 && b === 0) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast (224-239) + reserved/broadcast (240-255)
  return false;
}

/** IPv6 ranges that must never be fetched: loopback, link-local, unique-local,
 *  multicast, and any IPv4-mapped address whose embedded v4 is itself private. */
function isPrivateIpv6(ip: string): boolean {
  const norm = ip.toLowerCase();
  if (norm === '::1' || norm === '::') return true;
  if (norm.startsWith('fe80:') || norm.startsWith('fe8') || norm.startsWith('fe9') || norm.startsWith('fea') || norm.startsWith('feb')) return true; // link-local fe80::/10
  if (norm.startsWith('fc') || norm.startsWith('fd')) return true; // unique local fc00::/7
  if (norm.startsWith('ff')) return true; // multicast
  const mapped = norm.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped?.[1]) return isPrivateIpv4(mapped[1]);
  return false;
}

function isPrivateAddress(ip: string): boolean {
  if (isIPv4(ip)) return isPrivateIpv4(ip);
  if (isIPv6(ip)) return isPrivateIpv6(ip);
  return true; // unrecognized form — refuse rather than risk it
}

/** Resolve `hostname` and refuse if ANY resolved address is private/reserved —
 *  the "after DNS resolve" half of the guard (defeats DNS rebinding to an
 *  IP literal that passed the pre-resolve check). */
async function assertPublicHost(rawHostname: string): Promise<void> {
  // URL.hostname wraps IPv6 literals in brackets ("[::1]") — node:net's
  // isIPv6/isIPv4 don't accept that form, so strip them before classifying.
  const hostname =
    rawHostname.startsWith('[') && rawHostname.endsWith(']') ? rawHostname.slice(1, -1) : rawHostname;
  if (isIPv4(hostname) || isIPv6(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new DocFetchError(`refused: ${hostname} is a private/reserved address`);
    }
    return;
  }
  let addrs: { address: string }[];
  try {
    addrs = await lookup(hostname, { all: true });
  } catch (err) {
    throw new DocFetchError(`DNS resolution failed for ${hostname}: ${(err as Error).message}`);
  }
  for (const { address } of addrs) {
    if (isPrivateAddress(address)) {
      throw new DocFetchError(`refused: ${hostname} resolves to a private/reserved address`);
    }
  }
}

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        throw new DocFetchError(`response body exceeds ${maxBytes} byte limit`);
      }
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf-8');
}

export class HttpDocFetcher implements DocFetcher {
  async fetch(url: string): Promise<DocFetchResult> {
    let current: URL;
    try {
      current = new URL(url);
    } catch {
      throw new DocFetchError(`invalid URL: ${url}`);
    }

    for (let hop = 0; ; hop++) {
      if (current.protocol !== 'https:') {
        throw new DocFetchError(`refused: only https: URLs are allowed (got ${current.protocol})`);
      }
      await assertPublicHost(current.hostname);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch(current, {
          redirect: 'manual',
          signal: controller.signal,
          // No auth headers / cookies — this is an untrusted, arbitrary host.
          headers: { accept: ALLOWED_CONTENT_TYPES.join(', ') },
        });
      } catch (err) {
        throw new DocFetchError(`fetch failed: ${(err as Error).message}`);
      } finally {
        clearTimeout(timer);
      }

      if (res.status >= 300 && res.status < 400) {
        if (hop >= MAX_REDIRECTS) throw new DocFetchError('too many redirects');
        const location = res.headers.get('location');
        if (!location) throw new DocFetchError('redirect response missing Location header');
        current = new URL(location, current);
        continue; // re-validated (https-only + DNS check) at the top of the next iteration
      }

      if (!res.ok) throw new DocFetchError(`HTTP ${res.status} fetching ${current.toString()}`);

      const contentType = (res.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
      if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
        throw new DocFetchError(`disallowed content-type: ${contentType || '(none)'}`);
      }

      const text = await readCapped(res, MAX_BYTES);
      return { url: current.toString(), contentType, text };
    }
  }
}
