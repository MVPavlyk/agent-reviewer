/* format.ts — pure formatting helpers shared across Multi-Agent Review
   (AgentPicker, Configure run, Columns/Tabs). No I/O. */

/** Seconds-formatted duration, matching RunTraceDrawer's convention. */
export function formatSeconds(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  return `${(ms / 1000).toFixed(1)}s`;
}
