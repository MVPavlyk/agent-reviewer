import { describeAgent, runAgentCases } from "../../src/index.js";
// Deliberately reuses the strict variant's cases — same fixture, same practices, same
// threshold. Only the injected agent artifact differs (architecture-reviewer-lite has the
// "cite the specific documented rule per finding" hard rule removed). That is what makes this
// pair a controlled A/B rather than two unrelated evals: pnpm eval:repeat both with labels and
// pnpm eval:delta them to see exactly which practice moved.
import { cases } from "../architecture-reviewer/architecture-reviewer.cases.js";

describeAgent("architecture-reviewer-lite", () => runAgentCases("architecture-reviewer-lite", cases));

// FINDING (2026-08-23, pnpm eval:repeat -n 2 --label baseline/versionB, then MANUAL delta —
// pnpm eval:delta baseline versionB is BROKEN for this pair, see gotcha below):
// removing the "**Яке правило порушено:**" field DOES produce a measurable drop, but only on the
// reviewer-core-violations case: both citation practices there go 100% (2/2) -> 50% (1/2) between
// baseline and versionB. The checkout-diff case's citation practice stays floored at 0% on BOTH
// sides (that one is a pre-existing baseline defect — see the case-vocabulary fix note below —
// not something this manipulation moved). An n=1 spot-check taken mid-way (before the full n=2
// versionB series completed) looked like "no drop" because that one sample happened to still
// cite the source under an alternate field name ("**Порушення:**", driven by "Evidence
// discipline"); the full n=2 shows real, model-variance-sized but real signal in the expected
// direction. n=2 is still thin — don't treat 50% as a precise number, treat "did it drop from
// 100%" as the finding. Also: rule "identifiers" like `inward-only-dependencies` were never a
// real contract anywhere in this repo; the real one is path:line + quote (see the matching fix in
// architecture-reviewer.cases.ts).
//
// TOOLING GOTCHA: `pnpm eval:delta <A> <B>` matches tests by `nodeid`, which embeds the eval
// file's path AND the describe-block name (`agent:architecture-reviewer` vs
// `agent:architecture-reviewer-lite`) — so it CANNOT auto-diff two different agent files sharing
// the same cases, only two labeled runs of the SAME file (before/after an in-place edit). For a
// two-file A/B like this one, pull both `results/repeat-<label>.json` files and match by the test
// NAME (last segment) yourself instead of trusting eval:delta's output.
