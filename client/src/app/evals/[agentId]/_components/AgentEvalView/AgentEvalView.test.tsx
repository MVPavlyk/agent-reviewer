import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalBatchRecord } from "@devdigest/shared";
import messages from "../../../../../../messages/en/eval.json";

// client/INSIGHTS.md 2026-08-11: mock `@/lib/hooks/evals` directly, not the
// `@/lib/hooks` barrel.
const { useAgentEvalBatchesMock } = vi.hoisted(() => ({
  useAgentEvalBatchesMock: vi.fn(),
}));
vi.mock("@/lib/hooks/evals", () => ({
  useAgentEvalBatches: useAgentEvalBatchesMock,
}));

const { useAgentMock } = vi.hoisted(() => ({ useAgentMock: vi.fn() }));
vi.mock("@/lib/hooks/agents", () => ({ useAgent: useAgentMock }));

vi.mock("next/navigation", () => ({
  useParams: () => ({ agentId: "ag1" }),
}));

// AppShell pulls in ShellContext (theme, command palette, "shell" i18n
// namespace) this test has no interest in wiring up — render its children
// directly, same as every other _components test in this codebase.
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const { lineChartMock } = vi.hoisted(() => ({ lineChartMock: vi.fn() }));
vi.mock("@/vendor/ui/charts/LineChart", () => ({
  LineChart: (props: unknown) => {
    lineChartMock(props);
    return <div data-testid="line-chart" />;
  },
}));

import { AgentEvalView } from "./AgentEvalView";

afterEach(() => {
  cleanup();
  lineChartMock.mockClear();
});

beforeEach(() => {
  useAgentMock.mockReturnValue({ data: { id: "ag1", name: "Security Reviewer" } });
});

function batch(overrides: Partial<EvalBatchRecord> = {}): EvalBatchRecord {
  return {
    id: "b1",
    agent_id: "ag1",
    agent_version: 3,
    system_prompt_snapshot: "s",
    system_prompt_hash: "h1",
    model: "gpt-4.1",
    provider: "openai",
    skill_slugs: null,
    case_ids: ["c1", "c2"],
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

function renderWithProviders(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ eval: messages }}>{ui}</NextIntlClientProvider>);
}

describe("AgentEvalView", () => {
  it("mounts the trend chart with three series and no delta when only one batch exists", () => {
    useAgentEvalBatchesMock.mockReturnValue({
      data: [batch({ id: "b1" })],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderWithProviders(<AgentEvalView />);

    expect(screen.queryByTestId("line-chart")).not.toBeInTheDocument();
    expect(screen.queryByText(/▲/)).not.toBeInTheDocument();
    expect(screen.queryByText(/▼/)).not.toBeInTheDocument();
  });

  it("shows the latest batch's current metric values, not just a delta (AC-59)", () => {
    useAgentEvalBatchesMock.mockReturnValue({
      data: [batch({ id: "b1", recall: 0.8, precision: 0.7, citation_accuracy: 0.9 })],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderWithProviders(<AgentEvalView />);

    expect(screen.getByText("RECALL 80%")).toBeInTheDocument();
    expect(screen.getByText("PRECISION 70%")).toBeInTheDocument();
    expect(screen.getByText("CITATION ACCURACY 90%")).toBeInTheDocument();
  });

  it("mounts the trend chart with three series for two or more batches", () => {
    useAgentEvalBatchesMock.mockReturnValue({
      data: [
        batch({ id: "b1", started_at: "2026-08-19T00:00:00Z", recall: 0.6 }),
        batch({ id: "b2", started_at: "2026-08-20T00:00:00Z", recall: 0.8 }),
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderWithProviders(<AgentEvalView />);

    expect(screen.getByTestId("line-chart")).toBeInTheDocument();
    expect(lineChartMock).toHaveBeenCalledTimes(1);
    const props = lineChartMock.mock.calls[0]![0] as { series: { name: string }[] };
    expect(props.series).toHaveLength(3);
    expect(props.series.map((s) => s.name)).toEqual(["recall", "precision", "citation"]);
  });

  it("shows '—' for a null cost, never '$0.00'", () => {
    useAgentEvalBatchesMock.mockReturnValue({
      data: [batch({ id: "b1", cost_usd: null })],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderWithProviders(<AgentEvalView />);

    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
  });

  it("enables Compare only for exactly two checked runs of the same agent", () => {
    // Newest-first row order (RunsTable sorts by `started_at` desc): b2, b1,
    // b3 — so checkboxes[0]/[1] are the same agent, [2] is the other agent.
    useAgentEvalBatchesMock.mockReturnValue({
      data: [
        batch({ id: "b1", started_at: "2026-08-19T00:00:00Z" }),
        batch({ id: "b2", started_at: "2026-08-20T00:00:00Z" }),
        batch({ id: "b3", started_at: "2026-08-18T00:00:00Z", agent_id: "ag2" }),
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderWithProviders(<AgentEvalView />);

    const compareButton = screen.getByRole("button", { name: /compare/i });
    const checkboxes = screen.getAllByRole("checkbox");
    expect(compareButton).toBeDisabled();

    // Select 1 → still disabled.
    fireEvent.click(checkboxes[0]!);
    expect(compareButton).toBeDisabled();

    // Select a 2nd of the *same* agent → enabled.
    fireEvent.click(checkboxes[1]!);
    expect(compareButton).toBeEnabled();

    // Swap the 2nd pick for a run of a *different* agent → disabled again
    // (EC-14 — the predicate reads `agent_id`, not "exactly two checked").
    fireEvent.click(checkboxes[1]!);
    fireEvent.click(checkboxes[2]!);
    expect(compareButton).toBeDisabled();
  });
});
