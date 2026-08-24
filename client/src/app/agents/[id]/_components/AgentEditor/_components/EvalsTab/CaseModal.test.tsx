import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalCaseRecord } from "@devdigest/shared";
import agentsMessages from "../../../../../../../../messages/en/agents.json";

import { CaseModal } from "./CaseModal";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ agents: agentsMessages }}>{ui}</NextIntlClientProvider>);
}

function evalCase(overrides: Partial<EvalCaseRecord> = {}): EvalCaseRecord {
  return {
    id: "c1",
    owner_kind: "agent",
    owner_id: "ag1",
    name: "case-c1",
    input_diff: "@@ -1,2 +1,2 @@\n-a\n+b",
    input_meta: { source_finding: { finding_id: "f1", file: "a.ts", start_line: 1, end_line: 2 } },
    expected_output: [
      { file: "a.ts", start_line: 1, end_line: 2, severity: "critical", category: "security", title: "leak" },
    ],
    notes: null,
    last_run: { run_id: "r1", batch_id: "b1", pass: true, ran_at: "2026-08-20T00:01:00Z" },
    ...overrides,
  };
}

describe("CaseModal (SPEC-05 AC-52/53, NFR-10)", () => {
  it("is read-only: no Run case/Save/Delete/Run on save, shows diff, expected_output and status by text (AC-52/53)", () => {
    const onClose = vi.fn();
    renderWithIntl(<CaseModal row={evalCase()} onClose={onClose} />);

    // Diff and expected_output are present.
    expect(screen.getByText(/@@ -1,2 \+1,2 @@/)).toBeInTheDocument();
    expect(screen.getByText("leak")).toBeInTheDocument();
    expect(screen.getByText(/a\.ts:1-2/)).toBeInTheDocument();

    // Status is readable as text, not only via icon/color (NFR-10).
    expect(screen.getByText("passed")).toBeInTheDocument();

    // No case-editing affordances (AC-53).
    expect(screen.queryByRole("button", { name: /run case/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^save$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/run on save/i)).not.toBeInTheDocument();
  });

  it("must_not_flag case: empty expected_output renders the 'empty []' badge", () => {
    const onClose = vi.fn();
    renderWithIntl(<CaseModal row={evalCase({ expected_output: [], last_run: null })} onClose={onClose} />);

    expect(screen.getByText(/empty \[\]/i)).toBeInTheDocument();
    expect(screen.getByText("never run")).toBeInTheDocument();
  });
});
