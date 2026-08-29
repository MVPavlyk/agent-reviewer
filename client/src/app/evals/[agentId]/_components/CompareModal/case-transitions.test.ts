import { describe, it, expect } from "vitest";
import type { EvalCompareCase } from "@devdigest/shared";
import { classifyCases, sortWithRegressionsFirst, summarizeTransitions } from "./case-transitions";

function c(overrides: Partial<EvalCompareCase>): EvalCompareCase {
  return {
    case_id: "c0",
    case_name: "case",
    in_a: true,
    in_b: true,
    pass_a: true,
    pass_b: true,
    ...overrides,
  };
}

describe("case-transitions (SPEC-05 AC-65/AC-65a/AC-66/AC-67/EC-16)", () => {
  // 5 cases: 2 changed pass (one regression, one improvement), 1 only in A,
  // 1 pass=null in B, 1 unchanged.
  const regression = c({ case_id: "regr", case_name: "regression-case", pass_a: true, pass_b: false });
  const improvement = c({ case_id: "impr", case_name: "improvement-case", pass_a: false, pass_b: true });
  const onlyInA = c({ case_id: "only-a", case_name: "only-a-case", in_a: true, in_b: false, pass_a: true, pass_b: null });
  const errorInB = c({ case_id: "err-b", case_name: "error-case", pass_a: true, pass_b: null });
  const unchanged = c({ case_id: "same", case_name: "unchanged-case", pass_a: true, pass_b: true });

  const cases = [unchanged, onlyInA, improvement, regression, errorInB];

  it("N = 2 (only boolean pass differing in both batches), Y = 5 (every unique case, incl. only-in-one and null)", () => {
    expect(summarizeTransitions(cases)).toEqual({ n: 2, y: 5 });
  });

  it("sorts pass→fail regressions first, everything else keeps relative order", () => {
    const classified = classifyCases(cases);
    const sorted = sortWithRegressionsFirst(classified);
    expect(sorted[0]!.case_id).toBe("regr");
    expect(sorted[0]!.kind).toBe("regression");
    // Everything else follows in original order.
    expect(sorted.slice(1).map((row) => row.case_id)).toEqual(["same", "only-a", "impr", "err-b"]);
  });

  it("classifies a case only in one batch as only_a/only_b, never as a regression", () => {
    const [classifiedOnlyA] = classifyCases([onlyInA]);
    expect(classifiedOnlyA!.kind).toBe("only_a");
    expect(classifiedOnlyA!.verdict_b).toBeNull();
  });

  it("pass=null reads as verdict 'error', never 'fail'", () => {
    const [classifiedErr] = classifyCases([errorInB]);
    expect(classifiedErr!.verdict_b).toBe("error");
    expect(classifiedErr!.verdict_b).not.toBe("fail");
    expect(classifiedErr!.kind).toBe("unchanged");
  });

  it("a case only in one batch never contributes to N even though it's in Y", () => {
    const onlyCases = [onlyInA];
    expect(summarizeTransitions(onlyCases)).toEqual({ n: 0, y: 1 });
  });
});
