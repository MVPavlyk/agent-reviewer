import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../messages/en/multiAgent.json";
import type { AgentColumn, ReviewRecord } from "@devdigest/shared";

const { mutateMock } = vi.hoisted(() => ({ mutateMock: vi.fn() }));

vi.mock("@/lib/hooks", () => ({
  useFindingAction: () => ({ mutate: mutateMock, isPending: false }),
  usePrReviews: () => ({ data: REVIEWS }),
}));

const REVIEWS: ReviewRecord[] = [
  {
    id: "r1",
    pr_id: "pr1",
    agent_id: "a1",
    ran_at: "2026-01-01T00:00:00Z",
    verdict: "request_changes",
    score: 62,
    findings: [
      {
        id: "f1",
        severity: "CRITICAL",
        category: "security",
        title: "Hardcoded secret",
        file: "src/config.ts",
        start_line: 11,
        end_line: 11,
        rationale: "A secret is committed in plain text.",
        suggestion: "Move it to an env var.",
        confidence: 0.92,
        kind: "finding",
        trifecta_components: null,
        evidence: null,
        review_id: "r1",
        accepted_at: null,
        dismissed_at: null,
      },
    ],
  },
] as unknown as ReviewRecord[];

const COLUMNS: AgentColumn[] = [
  {
    run_id: "run1",
    agent_id: "a1",
    agent_name: "Security",
    provider: "openai",
    model: "gpt-4.1",
    status: "done",
    verdict: "request_changes",
    score: 62,
    summary: "One critical finding.",
    duration_ms: 8000,
    cost_usd: 0.03,
    findings: [{ id: "f1", severity: "CRITICAL", category: "security", title: "Hardcoded secret", file: "src/config.ts", start_line: 11, kind: "finding" }],
  },
  {
    run_id: "run2",
    agent_id: "a2",
    agent_name: "Performance",
    provider: "openai",
    model: "gpt-4.1",
    status: "done",
    verdict: "approve",
    score: 90,
    summary: "Nothing notable.",
    duration_ms: 6000,
    cost_usd: 0.01,
    findings: [],
  },
];

import { TabsView } from "./TabsView";

beforeEach(() => mutateMock.mockClear());
afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ multiAgent: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("TabsView", () => {
  it("shows the active agent's banner + findings, expands a card, and Accept persists (AC-20/21/22/23)", () => {
    renderWithIntl(<TabsView columns={COLUMNS} prId="pr1" onViewTrace={vi.fn()} />);

    expect(screen.getByText("One critical finding.")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Hardcoded secret"));
    expect(screen.getByText("Suggested fix")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(mutateMock).toHaveBeenCalledWith({ findingId: "f1", action: "accept", prId: "pr1" });
  });

  it("switching tabs shows the other agent's summary; stub actions do nothing (AC-24)", () => {
    renderWithIntl(<TabsView columns={COLUMNS} prId="pr1" onViewTrace={vi.fn()} />);

    fireEvent.click(screen.getByRole("tab", { name: /Performance/ }));
    expect(screen.getByText("Nothing notable.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Security/ }));
    fireEvent.click(screen.getByText("Hardcoded secret"));
    fireEvent.click(screen.getByRole("button", { name: "Learn" }));
    expect(mutateMock).not.toHaveBeenCalled();
  });
});
