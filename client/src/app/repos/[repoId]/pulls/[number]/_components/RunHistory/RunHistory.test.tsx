/**
 * RunHistory — the badge must reflect the review OUTCOME, not the run lifecycle.
 * Regression guard for the "green ✓ done on a run that found 5 blockers" bug:
 * a settled run is colored/labelled by its denormalized blocker/finding counts,
 * and shows the review score ring.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunSummary, FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import common from "../../../../../../../../messages/en/common.json";
import { RunHistory } from "./RunHistory";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  pushMock.mockClear();
});

function run(o: Partial<RunSummary>): RunSummary {
  return {
    run_id: "run-1",
    agent_id: "a1",
    agent_name: "Security Reviewer",
    provider: "openrouter",
    model: "deepseek/deepseek-v4-flash",
    status: "done",
    error: null,
    duration_ms: 1000,
    tokens_in: 100,
    tokens_out: 50,
    cost_usd: null,
    findings_count: 0,
    grounding: "0/0 passed",
    ran_at: "2026-06-11T18:44:34.000Z",
    score: null,
    blockers: null,
    ...o,
  };
}

function finding(o: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded Stripe secret key in commit",
    file: "src/config.ts",
    start_line: 12,
    end_line: 12,
    rationale: "Line 12 contains a literal string starting with sk_live_.",
    suggestion: null,
    confidence: 0.98,
    kind: "finding",
    review_id: "review-1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

function renderRuns(runs: RunSummary[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages, common }}>
      <RunHistory runs={runs} onOpenTrace={() => {}} />
    </NextIntlClientProvider>,
  );
}

describe("RunHistory — outcome badge", () => {
  it("a done run WITH blockers reads 'rejected' (never green 'done') + shows the score ring", () => {
    renderRuns([run({ status: "done", findings_count: 5, blockers: 5, score: 0 })]);
    expect(screen.getByText("rejected")).toBeInTheDocument();
    expect(screen.queryByText("done")).not.toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument(); // CircularScore renders the number
    expect(screen.getByText(/5 blockers/)).toBeInTheDocument();
  });

  it("a clean done run reads 'approved'", () => {
    renderRuns([run({ status: "done", findings_count: 0, blockers: 0, score: 95 })]);
    expect(screen.getByText("approved")).toBeInTheDocument();
    expect(screen.getByText("95")).toBeInTheDocument();
  });

  it("a done run with non-blocking findings reads 'reviewed'", () => {
    renderRuns([run({ status: "done", findings_count: 3, blockers: 0, score: 72 })]);
    expect(screen.getByText("reviewed")).toBeInTheDocument();
    expect(screen.queryByText(/blockers/)).not.toBeInTheDocument();
  });

  it("a failed run reads 'error'", () => {
    renderRuns([run({ status: "failed", error: "boom", score: null, blockers: null })]);
    expect(screen.getByText("error")).toBeInTheDocument();
  });

  it("a running run reads 'running'", () => {
    renderRuns([run({ status: "running", score: null, blockers: null })]);
    expect(screen.getByText("running")).toBeInTheDocument();
  });
});

describe("RunHistory — per-run severity breakdown", () => {
  it("renders severity icons instead of the text line when findingsByRunId has an entry", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages, common }}>
        <RunHistory
          runs={[run({ status: "done", findings_count: 3, blockers: 1, score: 38 })]}
          findingsByRunId={
            new Map([
              [
                "run-1",
                [
                  finding({ id: "f1", severity: "CRITICAL" }),
                  finding({ id: "f2", severity: "WARNING", title: "Retry-After header omitted" }),
                ],
              ],
            ])
          }
          repoId="repo1"
          prNumber={482}
          onOpenTrace={() => {}}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getAllByText("1")).toHaveLength(2); // one CRITICAL, one WARNING
    expect(screen.queryByText(/finding\(s\)/)).not.toBeInTheDocument();
  });

  it("falls back to the text line when the run has no entry in findingsByRunId", () => {
    renderRuns([run({ status: "done", findings_count: 3, blockers: 1, score: 38 })]);
    expect(screen.getByText(/3 finding\(s\)/)).toBeInTheDocument();
    expect(screen.getByText(/1 blockers/)).toBeInTheDocument();
  });

  it("excludes dismissed findings from both the count and the popover", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages, common }}>
        <RunHistory
          runs={[run({ status: "done", score: 38 })]}
          findingsByRunId={
            new Map([
              [
                "run-1",
                [
                  finding({ id: "f1", severity: "CRITICAL" }),
                  finding({ id: "f2", severity: "CRITICAL", dismissed_at: "2026-06-12T00:00:00Z" }),
                ],
              ],
            ])
          }
          repoId="repo1"
          prNumber={482}
          onOpenTrace={() => {}}
        />
      </NextIntlClientProvider>,
    );
    // Only the non-dismissed CRITICAL is counted.
    expect(screen.getByText("1")).toBeInTheDocument();
  });
});

describe("RunHistory — findings hover popover", () => {
  function renderWithFindings(findings: FindingRecord[]) {
    return render(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages, common }}>
        <RunHistory
          runs={[run({ status: "done", score: 38 })]}
          findingsByRunId={new Map([["run-1", findings]])}
          repoId="repo1"
          prNumber={482}
          onOpenTrace={() => {}}
        />
      </NextIntlClientProvider>,
    );
  }

  it("shows the findings preview on hover", () => {
    renderWithFindings([finding({ id: "f1" })]);
    expect(screen.queryByText("Hardcoded Stripe secret key in commit")).not.toBeInTheDocument();

    fireEvent.mouseOver(screen.getByText("1"));
    expect(screen.getByText("Hardcoded Stripe secret key in commit")).toBeInTheDocument();
  });

  it("navigates to the finding's tab/severity/item on click", () => {
    renderWithFindings([finding({ id: "f1", severity: "CRITICAL" })]);
    fireEvent.mouseOver(screen.getByText("1"));
    fireEvent.click(screen.getByText("Hardcoded Stripe secret key in commit"));
    expect(pushMock).toHaveBeenCalledWith(
      "/repos/repo1/pulls/482?tab=findings&sev=CRITICAL&findingItem=f1",
    );
  });

  it("does not show a popover for a run with no findings (renders the dash)", () => {
    renderWithFindings([]);
    expect(screen.getByText("—")).toBeInTheDocument();
    fireEvent.mouseOver(screen.getByText("—"));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("shows only the filename, never the full path (paths can be arbitrarily deep)", () => {
    renderWithFindings([
      finding({ id: "f1", file: "src/api/very/deeply/nested/module/public/webhooks.ts", start_line: 61 }),
    ]);
    fireEvent.mouseOver(screen.getByText("1"));
    expect(screen.getByText("webhooks.ts:61")).toBeInTheDocument();
    expect(
      screen.queryByText("src/api/very/deeply/nested/module/public/webhooks.ts:61"),
    ).not.toBeInTheDocument();
  });

  it("clicking a severity badge itself (not a popover item) fires onSelectSeverity, no navigation", () => {
    const onSelectSeverity = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages, common }}>
        <RunHistory
          runs={[run({ status: "done", score: 38 })]}
          findingsByRunId={
            new Map([
              [
                "run-1",
                [
                  finding({ id: "f1", severity: "CRITICAL" }),
                  finding({ id: "f2", severity: "WARNING" }),
                ],
              ],
            ])
          }
          repoId="repo1"
          prNumber={482}
          onSelectSeverity={onSelectSeverity}
          onOpenTrace={() => {}}
        />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getAllByText("1")[1]!); // the WARNING pill
    expect(onSelectSeverity).toHaveBeenCalledWith("WARNING");
    expect(pushMock).not.toHaveBeenCalled();
  });
});

describe("RunHistory — run cost badge", () => {
  it("a settled run shows its tokens and cost", () => {
    renderRuns([
      run({ status: "done", tokens_in: 9000, tokens_out: 119, cost_usd: 0.0013, score: 38 }),
    ]);
    expect(screen.getByText("9 119 tok · $0.0013")).toBeInTheDocument();
  });

  it("a settled run with no recorded cost shows a dash, never $0.00", () => {
    renderRuns([run({ status: "done", cost_usd: null, score: 95 })]);
    expect(screen.getByText(/—$/)).toBeInTheDocument();
    expect(screen.queryByText(/\$0\.00/)).not.toBeInTheDocument();
  });

  it("an unfinished run shows no cost at all", () => {
    renderRuns([run({ status: "running", cost_usd: null, score: null, blockers: null })]);
    expect(screen.queryByText(/tok ·/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });
});
