import { MAX_BODY_CHARS } from '../constants.js';

/**
 * Defense-in-depth for skill bodies entering the prompt as instructions
 * (decision 5 in docs/specs/skills.md — no `wrapUntrusted`). A skill body
 * renders before `## Diff to review`, so a literal `</untrusted>` inside it
 * would close the diff's fence early — this protects the NEIGHBOURING block,
 * not the skill itself. Applied to every body regardless of route (manual
 * create/edit AND import) so it cannot be bypassed via the plain `POST /skills`.
 */
export function sanitize(body: string): string {
  // eslint-disable-next-line no-control-regex -- intentionally stripping C0 control chars (keep \n, \t)
  const stripped = body.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  const escaped = stripped.replaceAll('</untrusted>', '<\\/untrusted>');
  return escaped.slice(0, MAX_BODY_CHARS);
}
