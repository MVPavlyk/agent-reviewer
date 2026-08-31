import { CiRunsView } from "./_components/CiRunsView";

/* Route: /ci-runs (CI Runs — GLOBAL nav group, Pass 9 of the Export-to-CI
   plan). One row per `ci_runs` row across the whole workspace; this route
   never ingests — see SPEC-05/ADDENDUM v2 decision 2 for the only writer
   (`POST /ci/ingest`). Thin route entry — the view, table, styles and
   helpers are colocated under _components/CiRunsView. */
export default function CiRunsPage() {
  return <CiRunsView />;
}
