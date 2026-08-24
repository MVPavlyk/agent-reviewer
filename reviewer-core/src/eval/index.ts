// eval — deterministic (non-LLM) eval scoring for the eval pipeline (SPEC-05).
// Thin barrel; see match.ts / score.ts for the actual logic and their module
// docs for the purity boundary this package must not cross.

export { match, normalizePath, type MatchTarget } from './match.js';
export {
  score,
  type ExpectedFinding,
  type SourceFindingZone,
  type EvalCaseKind,
  type EvalCaseClassification,
  type EvalCaseScoreInput,
  type EvalCaseScoreResult,
  type ScoreInput,
  type ScoreResult,
} from './score.js';
