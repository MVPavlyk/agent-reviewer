import { ContextDocsView } from "./_components/ContextDocsView";

/* Route: /repos/:repoId/context (Project Context, SPEC-02). Thin route entry
   — the view, its styles, constants and i18n are colocated under
   _components/ContextDocsView. */
export default function ContextPage() {
  return <ContextDocsView />;
}
