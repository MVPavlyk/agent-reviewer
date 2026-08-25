import { randomBytes, createHash } from 'node:crypto';

/**
 * A4 — per-installation ingest bearer token (ADDENDUM v2 "Ingest auth
 * contract"; Pass 5). Generated fresh on every REAL export
 * (`action:'files'`/`'open_pr'`); only the SHA-256 hash is ever persisted
 * (`ci_installations.ingest_token_hash`) — the plaintext is returned ONCE in
 * the `CiExport.ingest_token` response field so the wizard can tell the user
 * to add it as the target repo's `DEVDIGEST_INGEST_TOKEN` secret. Pass 6's
 * ingest endpoint re-hashes an incoming bearer token with `hashIngestToken`
 * and compares against the stored hash — never store or log the plaintext.
 *
 * `action:'preview'` never calls this (CRITICAL — zero DB writes, so there is
 * no installation row to attach a token to).
 */
export interface IngestToken {
  /** Shown once in the export response — never persisted, never logged. */
  token: string;
  /** SHA-256 hex digest — the only thing written to `ci_installations`. */
  hash: string;
}

const TOKEN_BYTES = 32;

export function generateIngestToken(): IngestToken {
  const token = randomBytes(TOKEN_BYTES).toString('hex');
  return { token, hash: hashIngestToken(token) };
}

/** SHA-256 hex digest — matches the codebase's existing hashing convention
 *  (e.g. `modules/evals/service.ts`'s `systemPromptHash`). Exported so Pass
 *  6's ingest auth guard can hash an incoming bearer token the same way. */
export function hashIngestToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
