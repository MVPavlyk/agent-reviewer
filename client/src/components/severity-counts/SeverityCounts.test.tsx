import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import common from "../../../messages/en/common.json";
import { SeverityCounts } from "./SeverityCounts";
import { countBySeverity, parseSeverityParam } from "./helpers";
import type { FindingRecord, SeverityCounts as SeverityCountsShape } from "@devdigest/shared";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ common }}>{ui}</NextIntlClientProvider>);
}

const COUNTS: SeverityCountsShape = { critical: 3, warning: 5, suggestion: 2 };
const ZERO: SeverityCountsShape = { critical: 0, warning: 0, suggestion: 0 };

describe("SeverityCounts — compact", () => {
  it("renders one badge per non-zero severity", () => {
    renderWithIntl(<SeverityCounts counts={COUNTS} variant="compact" />);
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("shows a dash when every level is zero or counts is null", () => {
    renderWithIntl(<SeverityCounts counts={ZERO} variant="compact" />);
    expect(screen.getByText("—")).toBeInTheDocument();
    cleanup();
    renderWithIntl(<SeverityCounts counts={null} variant="compact" />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("SeverityCounts — detailed", () => {
  it("fires onSelect with the clicked level, then null to toggle off", () => {
    const onSelect = vi.fn();
    renderWithIntl(
      <SeverityCounts counts={COUNTS} variant="detailed" selected={null} onSelect={onSelect} />,
    );
    screen.getByText("Critical").closest("button")!.click();
    expect(onSelect).toHaveBeenCalledWith("CRITICAL");

    cleanup();
    renderWithIntl(
      <SeverityCounts counts={COUNTS} variant="detailed" selected="CRITICAL" onSelect={onSelect} />,
    );
    screen.getByText("Critical").closest("button")!.click();
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("disables a zero-count level", () => {
    renderWithIntl(<SeverityCounts counts={{ critical: 0, warning: 5, suggestion: 2 }} variant="detailed" />);
    const critButton = screen.getByText("Critical").closest("button")!;
    expect(critButton).toBeDisabled();
  });
});

describe("countBySeverity", () => {
  const base = {
    id: "f1",
    category: "security",
    title: "t",
    file: "f.ts",
    start_line: 1,
    end_line: 1,
    rationale: "r",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
  } as const;

  it("excludes dismissed findings and ignores unknown severities", () => {
    const findings: FindingRecord[] = [
      { ...base, id: "f1", severity: "CRITICAL", dismissed_at: null },
      { ...base, id: "f2", severity: "CRITICAL", dismissed_at: "2026-01-01T00:00:00Z" },
      { ...base, id: "f3", severity: "WARNING", dismissed_at: null },
    ];
    expect(countBySeverity(findings)).toEqual({ critical: 1, warning: 1, suggestion: 0 });
  });
});

describe("parseSeverityParam", () => {
  it("accepts valid levels and rejects everything else", () => {
    expect(parseSeverityParam("CRITICAL")).toBe("CRITICAL");
    expect(parseSeverityParam("bogus")).toBeNull();
    expect(parseSeverityParam(null)).toBeNull();
    expect(parseSeverityParam(undefined)).toBeNull();
  });
});
