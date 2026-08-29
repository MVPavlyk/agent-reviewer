import { EvalDashboardView } from "./_components/EvalDashboardView";

/* Route: /evals (Eval Dashboard — one card per agent with ≥1 eval case,
   showing its latest batch's metrics, plus a table of recent runs across
   agents). Thin route entry — the view, cards, table, styles and helpers are
   colocated under _components/EvalDashboardView. */
export default function EvalsPage() {
  return <EvalDashboardView />;
}
