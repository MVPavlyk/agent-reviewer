import { describe, it, expect } from "vitest";
import type { ReviewRecord, FindingRecord } from "@devdigest/shared";
import { severityByFileLine } from "./helpers";

function finding(o: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f1",
    severity: "WARNING",
    category: "bug",
    title: "t",
    file: "src/a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "r",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    scope: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

function review(o: Partial<ReviewRecord>): ReviewRecord {
  return {
    id: "rev1",
    pr_id: "pr1",
    agent_id: "a1",
    run_id: "run1",
    agent_name: "Security",
    kind: "review",
    verdict: "comment",
    summary: "s",
    score: 90,
    model: "gpt",
    grounding: null,
    created_at: "2026-01-01T00:00:00Z",
    findings: [],
    ...o,
  };
}

describe("severityByFileLine", () => {
  it("expands start_line..end_line, excludes dismissed findings, and keeps only the latest run", () => {
    const latest = review({
      id: "rev-latest",
      run_id: "run-2",
      findings: [
        finding({ id: "f1", file: "src/a.ts", start_line: 10, end_line: 12, severity: "CRITICAL" }),
        finding({ id: "f2", file: "src/a.ts", start_line: 11, end_line: 11, severity: "SUGGESTION", dismissed_at: "2026-01-02T00:00:00Z" }),
      ],
    });
    const older = review({
      id: "rev-older",
      run_id: "run-1",
      findings: [finding({ id: "f3", file: "src/old.ts", start_line: 1, end_line: 1 })],
    });
    // Reviews arrive newest-first from the server.
    const map = severityByFileLine([latest, older]);

    expect(map.has("src/old.ts")).toBe(false);
    const aMap = map.get("src/a.ts");
    expect(aMap?.get(10)).toBe("CRITICAL");
    expect(aMap?.get(11)).toBe("CRITICAL"); // dismissed finding on the same line is ignored
    expect(aMap?.get(12)).toBe("CRITICAL");
  });

  it("includes every review sharing the latest run_id (multi-agent run) and returns empty when there are no reviews", () => {
    const runA = review({ id: "rev-a", run_id: "run-9", findings: [finding({ file: "src/a.ts", start_line: 1, end_line: 1, severity: "WARNING" })] });
    const runB = review({ id: "rev-b", run_id: "run-9", findings: [finding({ file: "src/b.ts", start_line: 5, end_line: 5, severity: "SUGGESTION" })] });
    const map = severityByFileLine([runA, runB]);
    expect(map.get("src/a.ts")?.get(1)).toBe("WARNING");
    expect(map.get("src/b.ts")?.get(5)).toBe("SUGGESTION");

    expect(severityByFileLine([]).size).toBe(0);
  });
});
