import { SkillsListView } from "./_components/SkillsListView";

/* Route: /skills (Skills list + preview). Thin route entry — the view, its
   add-skill drawer, styles, constants and i18n are colocated under
   _components/SkillsListView. */
export default function SkillsPage() {
  return <SkillsListView />;
}
