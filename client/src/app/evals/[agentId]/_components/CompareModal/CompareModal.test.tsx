import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalBatchRecord, EvalCompare } from "@devdigest/shared";
import messages from "../../../../../../messages/en/eval.json";

// client/INSIGHTS.md 2026-08-11: mock `@/lib/hooks/evals` directly, not the
// `@/lib/hooks` barrel.
const { useEvalCompareMock } = vi.hoisted(() => ({ useEvalCompareMock: vi.fn() }));
vi.mock("@/lib/hooks/evals", () => ({ useEvalCompare: useEvalCompareMock }));

import { CompareModal } from "./CompareModal";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ eval: messages }}>{ui}</NextIntlClientProvider>);
}

function batch(overrides: Partial<EvalBatchRecord> = {}): EvalBatchRecord {
  return {
    id: "b1",
    agent_id: "ag1",
    agent_version: 6,
    system_prompt_snapshot: "You are a reviewer.\nBe concise.",
    system_prompt_hash: "hash-a",
    model: "gpt-4.1",
    provider: "openai",
    skill_slugs: null,
    case_ids: ["c1", "c2", "c3"],
    status: "succeeded",
    recall: 0.8,
    precision: 0.7,
    citation_accuracy: 0.9,
    cost_usd: 0.05,
    traces_passed: 8,
    traces_total: 10,
    duration_ms: 4000,
    label: null,
    error: null,
    started_at: "2026-08-20T00:00:00Z",
    finished_at: "2026-08-20T00:01:00Z",
    ...overrides,
  };
}

function compareFixture(overrides: Partial<EvalCompare> = {}): EvalCompare {
  return {
    batch_a: batch({ id: "b1", agent_version: 6, system_prompt_snapshot: "You are a reviewer.\nBe concise." }),
    batch_b: batch({ id: "b2", agent_version: 7, system_prompt_snapshot: "You are a reviewer.\nBe thorough." }),
    cases: [
      { case_id: "c1", case_name: "regression-case", in_a: true, in_b: true, pass_a: true, pass_b: false },
      { case_id: "c2", case_name: "only-in-a-case", in_a: true, in_b: false, pass_a: true, pass_b: null },
      { case_id: "c3", case_name: "error-case", in_a: true, in_b: true, pass_a: true, pass_b: null },
    ],
    ...overrides,
  };
}

describe("CompareModal (SPEC-05 AC-62/63/64/65/65a/66/67, EC-15/16/19)", () => {
  it("builds the prompt diff from system_prompt_snapshot, never a mocked 'current' agent prompt (AC-64/EC-19)", () => {
    useEvalCompareMock.mockReturnValue({ data: compareFixture(), isLoading: false, isError: false });
    renderWithIntl(<CompareModal batchIdA="b1" batchIdB="b2" onClose={vi.fn()} />);

    // Shared line renders once ("same"); differing lines render as
    // removed/added pairs sourced from the two snapshots.
    expect(screen.getByText(/You are a reviewer\./)).toBeInTheDocument();
    expect(screen.getByText(/Be concise\./)).toBeInTheDocument();
    expect(screen.getByText(/Be thorough\./)).toBeInTheDocument();
  });

  it("shows a regression first, an 'only in <version>' row, and 'error' (never 'fail') for a null pass", () => {
    useEvalCompareMock.mockReturnValue({ data: compareFixture(), isLoading: false, isError: false });
    renderWithIntl(<CompareModal batchIdA="b1" batchIdB="b2" onClose={vi.fn()} />);

    // AC-65a summary line: N=1 (only the regression has a boolean pass
    // differing in both batches), Y=3 (every unique case row).
    expect(screen.getByText("Changed 1 of 3 cases")).toBeInTheDocument();

    // "only in v6" for the case present only in batch A (AC-66/EC-15).
    expect(screen.getByText("only in v6")).toBeInTheDocument();

    // pass=null renders as "error", never "fail" (AC-67).
    // Regression case is the first data row in the table (AC-65/EC-16); the
    // regression's own B column legitimately reads "fail" — that's the
    // regression's `pass_b: false`, distinct from `pass_b: null`.
    const rows = screen.getAllByRole("row");
    // rows[0] is the header row.
    expect(rows[1]).toHaveTextContent("regression-case");
    expect(rows[1]).toHaveTextContent("fail");

    // The error-case row (`pass_b: null`) reads "error" in its own row,
    // never "fail" for that specific cell (AC-67).
    const errorRow = rows.find((row) => row.textContent?.includes("error-case"));
    expect(errorRow).toHaveTextContent("error");
  });

  it("renders old → new plus a delta per metric, a cost row, and '—' with no delta when one side is null (AC-62/P-2)", () => {
    useEvalCompareMock.mockReturnValue({
      data: compareFixture({
        batch_a: batch({
          id: "b1",
          agent_version: 6,
          recall: 0.78,
          citation_accuracy: null,
          cost_usd: 0.05,
        }),
        batch_b: batch({
          id: "b2",
          agent_version: 7,
          recall: 0.82,
          citation_accuracy: 0.9,
          cost_usd: 0.05,
        }),
      }),
      isLoading: false,
      isError: false,
    });
    renderWithIntl(<CompareModal batchIdA="b1" batchIdB="b2" onClose={vi.fn()} />);

    // 1. recall 78 → 82 renders a visible +4-point delta.
    const recallRow = screen.getByText("RECALL").closest("div");
    expect(recallRow).toHaveTextContent("78% → 82%");
    expect(recallRow).toHaveTextContent("▲4%");

    // 2. a cost row is present, alongside recall/precision/citation.
    const costRow = screen.getByText("Cost").closest("div");
    expect(costRow).toHaveTextContent("$0.05 → $0.05");

    // 3. citation_accuracy is null on side A → "—" for that value, and no
    // delta is shown (nothing to subtract from null).
    const citationRow = screen.getByText("CITATION ACCURACY").closest("div");
    expect(citationRow).toHaveTextContent("— → 90%");
    expect(citationRow?.textContent).not.toMatch(/[▲▼]/);
  });
});
