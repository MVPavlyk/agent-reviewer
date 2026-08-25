import type { Agent, AgentEstimate } from "@devdigest/shared";

/** Lookup an agent's estimate by id, or undefined if it has none yet
 *  (loading, or genuinely no run history — both render as "—", AC-7). */
export function estimateFor(
  estimates: AgentEstimate[] | undefined,
  agentId: string,
): AgentEstimate | undefined {
  return estimates?.find((e) => e.agent_id === agentId);
}

/** Toggle one id in/out of a selection array, preserving order of the rest. */
export function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

/** `Select all` is itself a toggle: all → none, anything-else → all. */
export function selectAllIds(agents: Agent[], selectedIds: string[]): string[] {
  return selectedIds.length === agents.length ? [] : agents.map((a) => a.id);
}
