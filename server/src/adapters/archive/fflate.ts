import { unzipSync } from 'fflate';
import { MAX_ARCHIVE_ENTRIES, MAX_ENTRY_BYTES, TEXT_EXTENSIONS } from '../../modules/skills/constants.js';
import type {
  ArchiveReadResult,
  ArchiveReader,
  IgnoredEntry,
  SkillFileEntry,
} from '../../modules/skills/import/types.js';

/**
 * fflate-backed `ArchiveReader` — the ONLY place in this feature that touches
 * a third-party binary-format library (see `depgraph`/`tokenizer`/`astgrep`
 * for the same pattern: adapters/ wraps it, everything else stays pure).
 *
 * `unzipSync` runs entirely in memory: no temp directory, no extraction path,
 * no `fs` call — grep-provable (this file imports neither `node:fs` nor
 * `node:child_process`). Its `filter` callback runs against each entry's
 * header BEFORE inflating, so a zip bomb is never inflated and `install.sh`
 * is never read: reject anything past `MAX_ARCHIVE_ENTRIES`, any unsafe path
 * (zip-slip), any extension outside `TEXT_EXTENSIONS`, and any entry whose
 * declared `originalSize` exceeds `MAX_ENTRY_BYTES`.
 */

function isUnsafePath(path: string): boolean {
  return path.startsWith('/') || path.split('/').includes('..');
}

function extensionOf(path: string): string {
  const i = path.lastIndexOf('.');
  return i === -1 ? '' : path.slice(i).toLowerCase();
}

export class FflateArchiveReader implements ArchiveReader {
  read(bytes: Uint8Array): ArchiveReadResult {
    const ignored: IgnoredEntry[] = [];
    let seen = 0;

    const unzipped = unzipSync(bytes, {
      filter: (file) => {
        seen += 1;
        if (file.name.endsWith('/')) return false; // directory entry — not content
        if (seen > MAX_ARCHIVE_ENTRIES) {
          ignored.push({
            path: file.name,
            reason: `archive has more than ${MAX_ARCHIVE_ENTRIES} entries`,
          });
          return false;
        }
        if (isUnsafePath(file.name)) {
          ignored.push({ path: file.name, reason: 'unsafe path (absolute or contains ..)' });
          return false;
        }
        if (!TEXT_EXTENSIONS.has(extensionOf(file.name))) {
          ignored.push({ path: file.name, reason: 'not a recognised text/markdown file' });
          return false;
        }
        if (file.originalSize > MAX_ENTRY_BYTES) {
          ignored.push({ path: file.name, reason: `exceeds ${MAX_ENTRY_BYTES} bytes` });
          return false;
        }
        return true;
      },
    });

    const decoder = new TextDecoder();
    const entries: SkillFileEntry[] = Object.entries(unzipped).map(([path, data]) => ({
      path,
      text: decoder.decode(data),
    }));

    return { entries, ignored };
  }
}
