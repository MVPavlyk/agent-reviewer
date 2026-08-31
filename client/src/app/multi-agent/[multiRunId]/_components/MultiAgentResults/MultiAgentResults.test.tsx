import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../messages/en/multiAgent.json";
import runsMessages from "../../../../../../messages/en/runs.json";
import type { MultiAgentRun, PrDetail, RunTrace } from "@devdigest/shared";

const { replaceMock, searchState, runData } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  searchState: { value: "prId=pr1&mode=columns" },
  runData: { value: undefined as MultiAgentRun | undefined },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(searchState.value),
  useParams: () => ({ multiRunId: "run-abc" }),
}));

vi.mock("@/lib/hooks", () => ({
  useMultiAgentRun: () => ({ data: runData.value, isLoading: false, isError: !runData.value }),
  usePullDetail: () => ({ data: { title: "Add retries", number: 42 } as PrDetail }),
  useRunEvents: () => ({ events: [], running: false }),
  usePrReviews: () => ({ data: [] }),
}));

// RunTraceDrawer (promoted to components/RunTraceDrawer in WP3) imports its
// own hooks directly rather than through the barrel — mock those too so
// opening it here doesn't hit the network (AC-16).
const TRACE: RunTrace = {
  config: { agent: "Security", version: "1", provider: "openai", model: "gpt-4.1", pr: 42, source: "local" },
  stats: { duration_ms: 8000, tokens_in: 12000, tokens_out: 1500, cost_usd: 0.03, findings: 0, grounding: "n/a" },
  prompt_assembly: { system: "You are a reviewer.", skills: null, memory: null, specs: null, user: "Review PR #42" },
  tool_calls: [],
  raw_output: "",
  memory_pulled: [],
  specs_read: [],
  log: [],
};
vi.mock("@/lib/hooks/trace", () => ({
  useRunTrace: () => ({ data: TRACE, isLoading: false }),
}));
vi.mock("@/lib/hooks/reviews", () => ({
  useRunEvents: () => ({ events: [], running: false }),
}));

const RUN: MultiAgentRun = {
  id: "run-abc",
  pr_id: "pr1",
  pr_number: 42,
  ran_at: "2026-01-01T00:00:00Z",
  agent_count: 1,
  total_duration_ms: 8000,
  total_cost_usd: 0.03,
  columns: [
    {
      run_id: "runX",
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
      findings: [],
    },
  ],
  conflicts: [],
};

import { MultiAgentResults } from "./MultiAgentResults";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ multiAgent: messages, runs: runsMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("MultiAgentResults", () => {
  it("renders the header/meta and switches Columns→Tabs via ?mode= (AC-13/14/EC-10)", () => {
    runData.value = RUN;
    renderWithIntl(<MultiAgentResults multiRunId="run-abc" />);

    expect(screen.getByText(/Add retries/)).toBeInTheDocument();
    expect(screen.getByText(/1 agents · fan-out via worktrees/)).toBeInTheDocument();
    expect(screen.getByText("Security")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Tabs" }));
    expect(replaceMock).toHaveBeenCalledWith("/multi-agent/run-abc?prId=pr1&mode=tabs");
  });

  it("View trace opens the shared RunTraceDrawer for that run_id (AC-16/AC-16a)", () => {
    runData.value = RUN;
    renderWithIntl(<MultiAgentResults multiRunId="run-abc" />);

    expect(screen.queryByText("Agent run · Security")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("View trace"));
    expect(screen.getByText("Agent run · Security")).toBeInTheDocument();
    // The full RunTraceDrawer tab set is present, not a stripped-down fork.
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Tool calls")).toBeInTheDocument();
  });

  it("shows a not-found state for an unknown multi-agent run (EC-8)", () => {
    runData.value = undefined;
    renderWithIntl(<MultiAgentResults multiRunId="run-abc" />);
    expect(screen.getByText("Multi-agent run not found")).toBeInTheDocument();
  });
});
