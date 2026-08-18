import { githubBlobUrl } from "@/lib/github-urls";

/** Last path segment — a caller's `file` can be an arbitrarily deep repo
 *  path; the popover/list is narrow, so show just the filename and put the
 *  full path in a `title` tooltip (R16). */
function basename(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? path : path.slice(idx + 1);
}

interface CallerLinkProps {
  repoFullName: string | null;
  /** `coverage.last_indexed_sha` — the commit the repo-intel index (and so
   *  this line number) actually reflects. Deliberately NOT the PR's own
   *  `head_sha`: the index tracks the default branch, so for an old PR the
   *  two can be far apart and a `head_sha` link would point at the wrong
   *  version of the file. */
  indexedSha: string | null;
  file: string;
  line: number;
}

/** `basename:line`, linking out to the file at the commit the index was
 *  built from. Renders as plain (non-link) text when `repoFullName` or
 *  `indexedSha` isn't known. */
export function CallerLink({ repoFullName, indexedSha, file, line }: CallerLinkProps) {
  const label = `${basename(file)}:${line}`;
  if (!repoFullName || !indexedSha) {
    return (
      <span className="mono" title={file}>
        {label}
      </span>
    );
  }
  return (
    <a
      className="mono"
      href={githubBlobUrl(repoFullName, indexedSha, file, line)}
      target="_blank"
      rel="noreferrer"
      title={file}
    >
      {label}
    </a>
  );
}
