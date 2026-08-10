import type { SkillSource, SkillType } from '@devdigest/shared';

/** One decompressed archive entry, or a single virtual entry for a plain `.md` upload. */
export interface SkillFileEntry {
  path: string;
  text: string;
}

/** An archive entry that was rejected before being treated as skill content. */
export interface IgnoredEntry {
  path: string;
  reason: string;
}

/** The extracted skill draft — shown to the user for edit/confirm before `POST /skills`. */
export interface SkillDraft {
  name: string;
  description: string;
  type: SkillType;
  source: SkillSource;
  body: string;
}

export interface ArchiveReadResult {
  entries: SkillFileEntry[];
  ignored: IgnoredEntry[];
}

/**
 * Port for decompressing an untrusted archive into in-memory text entries.
 * Declared here, next to its consumer (`extract.ts`), per the
 * onion-architecture skill — the implementation (fflate, in-memory, no fs)
 * lives in `server/src/adapters/archive/` and is exposed via
 * `Container.archive`.
 */
export interface ArchiveReader {
  read(bytes: Uint8Array): ArchiveReadResult;
}
