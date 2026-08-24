import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent } from "@devdigest/shared";
import type { EvalBatchRecord, EvalCaseRecord } from "@devdigest/shared";
import agentsMessages from "../../../../../../../../messages/en/agents.json";

// client/INSIGHTS.md 2026-08-11: mock `@/lib/hooks/evals` directly, not the
// `@/lib/hooks` barrel.
const {
  useAgentEvalCasesMock,
  useAgentEvalBatchesMock,
  useEvalBatchMock,
  useRunAgentEvalsMock,
  mutate,
} = vi.hoisted(() => ({
  useAgentEvalCasesMock: vi.fn(),
  useAgentEvalBatchesMock: vi.fn(),
  useEvalBatchMock: vi.fn(),
  useRunAgentEvalsMock: vi.fn(),
  mutate: vi.fn(),
}));
vi.mock("@/lib/hooks/evals", () => ({
  useAgentEvalCases: useAgentEvalCasesMock,
  useAgentEvalBatches: useAgentEvalBatchesMock,
  useEvalBatch: useEvalBatchMock,
  useRunAgentEvals: useRunAgentEvalsMock,
}));

import { EvalsTab } from "./EvalsTab";

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "s",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

function batch(overrides: Partial<EvalBatchRecord> = {}): EvalBatchRecord {
  return {
    id: "b1",
    agent_id: "ag1",
    agent_version: 1,
    system_prompt_snapshot: "s",
    system_prompt_hash: "h1",
    model: "gpt-4.1",
    provider: "openai",
    skill_slugs: null,
    case_ids: ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"],
    status: "succeeded",
    recall: 0.75,
    precision: null,
    citation_accuracy: 0.9,
    cost_usd: 0.012,
    traces_passed: 6,
    traces_total: 8,
    duration_ms: 4000,
    label: null,
    error: null,
    started_at: "2026-08-20T00:00:00Z",
    finished_at: "2026-08-20T00:01:00Z",
    ...overrides,
  };
}

function evalCase(id: string, overrides: Partial<EvalCaseRecord> = {}): EvalCaseRecord {
  return {
    id,
    owner_kind: "agent",
    owner_id: "ag1",
    name: `case-${id}`,
    input_diff: "@@ -1,2 +1,2 @@\n-a\n+b",
    input_meta: { source_finding: { finding_id: "f1", file: "a.ts", start_line: 1, end_line: 2 } },
    expected_output: [{ file: "a.ts", start_line: 1, end_line: 2, severity: "critical", category: "security", title: "leak" }],
    notes: null,
    last_run: null,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

function renderWithIntl(ui: React.ReactElement) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ agents: agentsMessages }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("EvalsTab (SPEC-05 AC-44/45/46/47/48/49/49a/50/51/54)", () => {
  it("empty state: 0 cases → explains creation flow, Run all evals disabled (AC-54)", () => {
    useAgentEvalCasesMock.mockReturnValue({ data: [] });
    useAgentEvalBatchesMock.mockReturnValue({ data: [] });
    useEvalBatchMock.mockReturnValue({ data: undefined });
    useRunAgentEvalsMock.mockReturnValue({ mutate, isPending: false });

    renderWithIntl(<EvalsTab agent={AGENT} />);

    expect(screen.getByText(/no eval cases yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run all evals/i })).toBeDisabled();
  });

  it("4 metric tiles + case list + Run all evals button; null metric renders — (AC-46/AC-50)", () => {
    const b = batch({ precision: null });
    useAgentEvalCasesMock.mockReturnValue({ data: [evalCase("c1", { last_run: { run_id: "r1", batch_id: "b1", pass: true, ran_at: "2026-08-20T00:01:00Z" } })] });
    useAgentEvalBatchesMock.mockReturnValue({ data: [b] });
    useEvalBatchMock.mockReturnValue({ data: { batch: b, completed_cases: 8 } });
    useRunAgentEvalsMock.mockReturnValue({ mutate, isPending: false });

    renderWithIntl(<EvalsTab agent={AGENT} />);

    expect(screen.getByText("75%")).toBeInTheDocument(); // recall
    expect(screen.getByText("90%")).toBeInTheDocument(); // citation
    expect(screen.getByText("—")).toBeInTheDocument(); // precision === null
    expect(screen.getByRole("button", { name: /run all evals/i })).toBeInTheDocument();
    expect(screen.getByText("case-c1")).toBeInTheDocument();
  });

  it("shows a TRACES PASSED tile from the batch aggregates, with no delta when there is no previous batch (AC-44/AC-46)", () => {
    const b = batch();
    useAgentEvalCasesMock.mockReturnValue({ data: [evalCase("c1", { last_run: { run_id: "r1", batch_id: "b1", pass: true, ran_at: "2026-08-20T00:01:00Z" } })] });
    useAgentEvalBatchesMock.mockReturnValue({ data: [b] }); // only one batch — no previous
    useEvalBatchMock.mockReturnValue({ data: { batch: b, completed_cases: 8 } });
    useRunAgentEvalsMock.mockReturnValue({ mutate, isPending: false });

    renderWithIntl(<EvalsTab agent={AGENT} />);

    expect(screen.getByText("6/8")).toBeInTheDocument();
    expect(screen.queryByText(/▲|▼|±0%/)).not.toBeInTheDocument();
  });

  it("renders a delta on every tile when a previous batch exists (AC-46)", () => {
    const latest = batch({ id: "b2", recall: 0.8, citation_accuracy: 0.9, traces_passed: 7, traces_total: 8, started_at: "2026-08-21T00:00:00Z" });
    const previous = batch({ id: "b1", recall: 0.6, citation_accuracy: 0.9, traces_passed: 4, traces_total: 8, started_at: "2026-08-20T00:00:00Z" });
    useAgentEvalCasesMock.mockReturnValue({ data: [evalCase("c1", { last_run: { run_id: "r1", batch_id: "b2", pass: true, ran_at: "2026-08-21T00:01:00Z" } })] });
    useAgentEvalBatchesMock.mockReturnValue({ data: [latest, previous] }); // newest-first
    useEvalBatchMock.mockReturnValue({ data: { batch: latest, completed_cases: 8 } });
    useRunAgentEvalsMock.mockReturnValue({ mutate, isPending: false });

    renderWithIntl(<EvalsTab agent={AGENT} />);

    expect(screen.getByText("▲20%")).toBeInTheDocument(); // recall 0.6 -> 0.8
    expect(screen.getByText("±0%")).toBeInTheDocument(); // citation unchanged
    expect(screen.getByText("7/8")).toBeInTheDocument(); // traces passed tile value
    expect(screen.getByText("▲38%")).toBeInTheDocument(); // pass rate 4/8 -> 7/8
  });

  it("clicking Run all evals calls the mutation with an explicit {} (AC-47)", () => {
    useAgentEvalCasesMock.mockReturnValue({ data: [evalCase("c1")] });
    useAgentEvalBatchesMock.mockReturnValue({ data: [] });
    useEvalBatchMock.mockReturnValue({ data: undefined });
    useRunAgentEvalsMock.mockReturnValue({ mutate, isPending: false });

    renderWithIntl(<EvalsTab agent={AGENT} />);
    fireEvent.click(screen.getByRole("button", { name: /run all evals/i }));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({});
  });

  it("while running: polls every 2000ms, shows N / traces_total, disables the button (AC-48/EC-5)", () => {
    vi.useFakeTimers();
    const runningBatch = batch({ status: "running", recall: null, precision: null, citation_accuracy: null, cost_usd: null, traces_passed: null });
    useAgentEvalCasesMock.mockReturnValue({ data: [evalCase("c1")] });
    useAgentEvalBatchesMock.mockReturnValue({ data: [runningBatch] });
    useRunAgentEvalsMock.mockReturnValue({ mutate, isPending: false });

    // A stateful mock: while given a truthy interval, it ticks its own
    // setInterval (advanced by fake timers) and increments `completed_cases`,
    // proving the component actually threads `POLL_INTERVAL_MS` through.
    useEvalBatchMock.mockImplementation((batchId: string | null, interval: number | false) => {
      const [n, setN] = React.useState(0);
      React.useEffect(() => {
        if (!interval) return undefined;
        const id = setInterval(() => setN((x) => x + 1), interval);
        return () => clearInterval(id);
      }, [interval]);
      const completed = Math.min(2 + n, 8);
      return { data: { batch: { ...runningBatch, status: "running" as const }, completed_cases: completed } };
    });

    renderWithIntl(<EvalsTab agent={AGENT} />);

    expect(screen.getByText("2 / 8")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run all evals|running/i })).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByText("3 / 8")).toBeInTheDocument();
    // Prove the interval passed to the hook is exactly POLL_INTERVAL_MS.
    expect(useEvalBatchMock).toHaveBeenCalledWith("b1", 2000);
  });

  it("partial batch: shows the partial badge AND the not-ran count (AC-49/AC-49a)", () => {
    const b = batch({ status: "partial", traces_passed: 6, traces_total: 8 });
    const cases: EvalCaseRecord[] = b.case_ids.map((id, i) =>
      evalCase(id, {
        last_run:
          i < 6
            ? { run_id: `r${i}`, batch_id: "b1", pass: true, ran_at: "2026-08-20T00:01:00Z" }
            : null, // 2 cases never ran in this batch
      }),
    );
    useAgentEvalCasesMock.mockReturnValue({ data: cases });
    useAgentEvalBatchesMock.mockReturnValue({ data: [b] });
    useEvalBatchMock.mockReturnValue({ data: { batch: b, completed_cases: 6 } });
    useRunAgentEvalsMock.mockReturnValue({ mutate, isPending: false });

    renderWithIntl(<EvalsTab agent={AGENT} />);

    expect(screen.getByText("partial")).toBeInTheDocument();
    expect(screen.getByText(/2 cases did not finish/i)).toBeInTheDocument();
  });

  it("passing badge: a never-run case counts in Y, not in X (AC-51)", () => {
    const b = batch({ case_ids: ["c1", "c2"] });
    const cases: EvalCaseRecord[] = [
      evalCase("c1", { last_run: { run_id: "r1", batch_id: "b1", pass: true, ran_at: "2026-08-20T00:01:00Z" } }),
      evalCase("c2", { last_run: null }), // never run
    ];
    useAgentEvalCasesMock.mockReturnValue({ data: cases });
    useAgentEvalBatchesMock.mockReturnValue({ data: [b] });
    useEvalBatchMock.mockReturnValue({ data: { batch: b, completed_cases: 1 } });
    useRunAgentEvalsMock.mockReturnValue({ mutate, isPending: false });

    renderWithIntl(<EvalsTab agent={AGENT} />);

    expect(screen.getByText("1 / 2 passing")).toBeInTheDocument();
  });
});
