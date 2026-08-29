import type { BriefCore } from '@devdigest/shared';

/**
 * Brief Layer — grounding (SPEC-03 AC-15..AC-20, EC-3, EC-4). A pure,
 * deterministic citation gate: the model's `BriefCore` output may reference a
 * file it hallucinated (never one of the inputs it was actually given), so
 * this strips anything that doesn't cite a file from the allowed set BEFORE
 * the brief is ever persisted.
 *
 * Onion Architecture domain core — NO imports of Container, Drizzle, Fastify,
 * or `node:*`. The only dependency is `@devdigest/shared` types. Never makes
 * a second model call; grounding only subtracts, it never re-asks.
 */

/** Trim, drop a leading `./`, drop a leading `/` — paths stay case-sensitive
 *  (never lower-cased; POSIX filesystems are case-sensitive). */
export function normalizeRef(p: string): string {
  let out = p.trim();
  if (out.startsWith('./')) out = out.slice(2);
  while (out.startsWith('/')) out = out.slice(1);
  return out;
}

/**
 * The minimal shape `allowedRefs` actually reads off a blast radius — a
 * structural subset of both `BlastRadius` (server's full shape) AND
 * `BlastPromptView` (`brief/sources.ts`'s prompt-safe projection), so a
 * caller can pass EITHER without a cast. Callers MUST pass the same
 * (possibly truncated) blast/file data that was actually sent to the model
 * (AC-15/EC-8) — grounding against the untruncated originals would allow
 * refs that never made it into the prompt.
 */
export interface AllowedRefsBlast {
  changed_symbols: { file: string }[];
  downstream: {
    callers: { file: string }[];
    endpoints_affected: { file: string; value: string }[];
    crons_affected: { file: string; value: string }[];
  }[];
}

export interface AllowedRefsInput {
  /** Paths of the PR's own changed files — the TRUNCATED file list actually
   *  sent to the model, not the full diff's file list. */
  files: string[];
  blast: AllowedRefsBlast;
}

/**
 * The set of file paths the brief is allowed to cite: the PR's own changed
 * files, plus every file path (and endpoint/cron VALUE — a `review_focus`/
 * `risk` item may cite the route string itself, e.g. "POST /webhooks") the
 * blast-radius bundle surfaced (AC-15). When blast degraded to
 * `reason: 'diff_not_loaded'`, `blast.changed_symbols`/`downstream` are empty
 * (see `emptyBlastRadius`), so the allowed set naturally reduces to just the
 * changed files (EC-2) — no special-casing needed here.
 */
export function allowedRefs(input: AllowedRefsInput): Set<string> {
  const out = new Set<string>();
  for (const f of input.files) out.add(normalizeRef(f));
  for (const sym of input.blast.changed_symbols) out.add(normalizeRef(sym.file));
  for (const d of input.blast.downstream) {
    for (const caller of d.callers) out.add(normalizeRef(caller.file));
    for (const ep of d.endpoints_affected) {
      out.add(normalizeRef(ep.file));
      out.add(normalizeRef(ep.value));
    }
    for (const cron of d.crons_affected) {
      out.add(normalizeRef(cron.file));
      out.add(normalizeRef(cron.value));
    }
  }
  return out;
}

export interface GroundBriefResult {
  brief: BriefCore;
  /** Count of individual file_refs / review_focus items dropped for citing
   *  something outside `allowed` — logged by the caller (AC-18, AC-33). */
  droppedRefs: number;
}

/**
 * Filters `review_focus` items and each risk's `file_refs` down to only the
 * refs present in `allowed`. A `review_focus` item with an unresolved ref is
 * dropped entirely (AC-16); a risk keeps only its grounded `file_refs`, and is
 * itself dropped once `file_refs` empties out (AC-17). `risk_level` is never
 * recomputed from the surviving risks (AC-20) — it's the model's own overall
 * verdict, not a derived count. Empty `risks`/`review_focus` after grounding
 * (even total wipeout) is a valid result, not an error (AC-19).
 */
export function groundBrief(core: BriefCore, allowed: Set<string>): GroundBriefResult {
  let droppedRefs = 0;

  const review_focus = core.review_focus.filter((item) => {
    const ok = allowed.has(normalizeRef(item.file));
    if (!ok) droppedRefs += 1;
    return ok;
  });

  const risks = core.risks
    .map((risk) => {
      const keptRefs = risk.file_refs.filter((ref) => allowed.has(normalizeRef(ref)));
      droppedRefs += risk.file_refs.length - keptRefs.length;
      return { ...risk, file_refs: keptRefs };
    })
    .filter((risk) => risk.file_refs.length > 0);

  return {
    brief: { ...core, risks, review_focus },
    droppedRefs,
  };
}
