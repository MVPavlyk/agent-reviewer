/* agent-accent.ts — deterministic per-agent accent color for Multi-Agent
   Review (Configure run picker, Columns/Tabs headers). No agent color tokens
   exist elsewhere in the product (checked `vendor/ui`) — this is a
   feature-level map, not a design-system addition.

   Color is NEVER the sole carrier of meaning here: every consumer pairs the
   accent with an icon and/or the agent's name text (NFR a11y). */

/** 6-color palette, distinct from severity semantics (--crit/--warn/--ok are
 *  reserved for severity, not agent identity) except where a named seed
 *  agent intentionally borrows one for a mnemonic match (Security → red). */
const PALETTE = [
  "var(--crit)", // red
  "var(--warn)", // amber
  "var(--accent)", // blue
  "#8b5cf6", // purple
  "#14b8a6", // teal
  "#ec4899", // pink
] as const;

/** Named overrides for the seed agents (product decision, not derived) —
 *  matched case-insensitively against a substring of the agent's name so a
 *  renamed-but-recognizable seed agent still gets its expected color. */
const NAMED_OVERRIDES: { match: RegExp; color: string }[] = [
  { match: /security/i, color: "var(--crit)" },
  { match: /performance/i, color: "var(--warn)" },
  { match: /junior mentor/i, color: "var(--accent)" },
  { match: /customer.?facing/i, color: "#8b5cf6" },
  { match: /architecture/i, color: "#14b8a6" },
];

/** FNV-1a-ish string hash — stable across sessions/runs (no Math.random). */
function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic accent color for an agent. Prefers a named override by
 *  `agentName` (seed agents); falls back to a hash of `agentId` over the
 *  palette so any other/custom agent still gets a stable, distinct color. */
export function agentAccentColor(agentId: string, agentName?: string | null): string {
  if (agentName) {
    const hit = NAMED_OVERRIDES.find((o) => o.match.test(agentName));
    if (hit) return hit.color;
  }
  return PALETTE[hashString(agentId) % PALETTE.length]!;
}
