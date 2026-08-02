/**
 * PRRow — no prior render test existed for this row (see client/INSIGHTS.md on
 * the FINDINGS column addition). Covers just the new severity-counts cell:
 * icons+counts for a reviewed PR, "—" for one with no findings yet.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@/lib/types";
import type { FindingRecord } from "@devdigest/shared";
import prReview from "../../../../../../../messages/en/prReview.json";
import common from "../../../../../../../messages/en/common.json";
import { PRRow } from "./PRRow";
import { usePrReviews } from "@/lib/hooks/reviews";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
}));

// The findings popover lazily fetches full findings on hover (the list
// endpoint only carries aggregate counts) — mock the hook rather than pull in
// react-query + fetch plumbing this test doesn't otherwise need.
vi.mock("@/lib/hooks/reviews", () => ({ usePrReviews: vi.fn() }));
const mockedUsePrReviews = vi.mocked(usePrReviews);

afterEach(() => {
  cleanup();
  pushMock.mockClear();
  mockedUsePrReviews.mockReset();
});

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
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

function pr(o: Partial<PrMeta>): PrMeta {
  return {
    id: "pr1",
    number: 482,
    title: "Add rate limiting to public API endpoints",
    author: "marisa.koch",
    branch: "feat/rate-limit-public",
    base: "main",
    head_sha: "a1b2c3d4",
    additions: 247,
    deletions: 38,
    files_count: 9,
    status: "needs_review",
    opened_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T03:00:00Z",
    score: 61,
    cost_usd: 0.014,
    findings: null,
    ...o,
  };
}

function renderRow(row: PrMeta) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview, common }}>
      <PRRow pr={row} repoId="repo1" />
    </NextIntlClientProvider>,
  );
}

describe("PRRow — findings cell", () => {
  it("renders icon + count per non-zero severity", () => {
    renderRow(pr({ findings: { critical: 2, warning: 2, suggestion: 0 } }));
    expect(screen.getAllByText("2")).toHaveLength(2); // CRITICAL + WARNING pills; SUGGESTION (0) omitted
  });

  it("shows a dash when the PR has no findings", () => {
    renderRow(pr({ findings: null }));
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});

describe("PRRow — findings popover", () => {
  it("lazily fetches and shows the preview on hover, and navigates on click", () => {
    mockedUsePrReviews.mockReturnValue({
      data: [
        {
          id: "r1",
          pr_id: "pr1",
          agent_id: null,
          run_id: "run1",
          agent_name: "Security Reviewer",
          kind: "review",
          verdict: null,
          summary: null,
          score: null,
          model: null,
          grounding: null,
          created_at: "2026-06-11T00:00:00Z",
          findings: [finding({ severity: "CRITICAL" })],
        },
      ],
      isLoading: false,
    } as any);

    renderRow(pr({ findings: { critical: 1, warning: 0, suggestion: 0 } }));
    // Not fetched until hovered — the list endpoint only carries counts.
    expect(mockedUsePrReviews).not.toHaveBeenCalled();

    fireEvent.mouseOver(screen.getByText("1"));
    expect(mockedUsePrReviews).toHaveBeenCalledWith("pr1");
    expect(screen.getByText("Hardcoded Stripe secret key in commit")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Hardcoded Stripe secret key in commit"));
    expect(pushMock).toHaveBeenCalledWith(
      "/repos/repo1/pulls/482?tab=findings&sev=CRITICAL&findingItem=f1",
    );
    // Clicking a finding must not also bubble into the row's own "open this PR" click.
    expect(pushMock).not.toHaveBeenCalledWith("/repos/repo1/pulls/482");
  });

  it("clicking a severity badge itself (not a popover item) navigates straight to that severity", () => {
    renderRow(pr({ findings: { critical: 2, warning: 1, suggestion: 0 } }));
    // No hover needed — the badges are visible without opening the popover.
    fireEvent.click(screen.getByText("1")); // the WARNING pill
    expect(pushMock).toHaveBeenCalledWith("/repos/repo1/pulls/482?tab=findings&sev=WARNING");
    // Must not also bubble into the row's own "open this PR" click.
    expect(pushMock).not.toHaveBeenCalledWith("/repos/repo1/pulls/482");
  });

  it("never wraps the dash in a popover (no findings ⇒ no fetch)", () => {
    renderRow(pr({ findings: null }));
    fireEvent.mouseOver(screen.getAllByText("—")[0]!);
    expect(mockedUsePrReviews).not.toHaveBeenCalled();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
