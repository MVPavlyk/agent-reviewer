/* hooks/ barrel — every React Query hook over the F1/feature APIs.
   Import from "@/lib/hooks" for the platform hooks (settings/repos/pulls/context)
   or from a domain file directly (e.g. "@/lib/hooks/reviews") — both resolve here.
   Explicit named exports only — no `export *`, so a runtime value import here
   can't silently drag the whole barrel into the bundle (see the vendor/shared
   Gotcha in ../../../CLAUDE.md for why that matters). */
export {
  useSettings,
  useUpdateSettings,
  useTestConnection,
  useSecretsStatus,
  useRepos,
  useAddRepo,
  useRefreshRepo,
  useDeleteRepo,
  usePulls,
  usePullDetail,
  useSmartDiff,
  useContextFiles,
  useReindexContext,
} from "./core";

export {
  useAgents,
  useAgent,
  useCreateAgent,
  useUpdateAgent,
  useDeleteAgent,
  useProviderModels,
} from "./agents";
export type { CreateAgentInput, UpdateAgentInput } from "./agents";

export {
  useSkills,
  useSkill,
  useCreateSkill,
  useUpdateSkill,
  useDeleteSkill,
  useImportSkillPreview,
  useAgentSkills,
  useSetAgentSkills,
  useSkillVersions,
  useRestoreSkillVersion,
  useSkillStats,
} from "./skills";
export type {
  CreateSkillInput,
  UpdateSkillInput,
  ImportSkillPreviewInput,
  ImportSkillPreviewResult,
} from "./skills";

export {
  usePrActiveRuns,
  usePrRuns,
  usePrReviews,
  useDeleteRun,
  useCancelRun,
  useDeleteReview,
  usePrComments,
  useCreatePrComment,
  useRunReview,
  useFindingAction,
  useRunEvents,
} from "./reviews";
export type { ActiveRun, CreateCommentInput, RunReviewInput } from "./reviews";

export { useRunTrace } from "./trace";

export { useRepoIntelStatus, useResyncRepoIntel } from "./repo-intel";
export type { RepoIntelState } from "./repo-intel";

export { usePrBlast } from "./blast";

export { usePrBrief, useGenerateBrief } from "./brief";

export {
  useContextDocs,
  useRefreshContextDocs,
  useContextDocContent,
  useAgentContextDocs,
  useSetAgentContextDocs,
  useSkillContextDocs,
  useSetSkillContextDocs,
} from "./context-docs";
