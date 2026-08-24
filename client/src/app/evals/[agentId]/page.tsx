import { AgentEvalView } from "./_components/AgentEvalView";

/* Route: /evals/:agentId (one agent's eval history — metric trend + a runs
   table with checkboxes feeding the Compare flow). Thin route entry — the
   view, chart, table, styles and helpers are colocated under
   _components/AgentEvalView. */
export default function AgentEvalPage() {
  return <AgentEvalView />;
}
