import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvalBatchRecord } from "@devdigest/shared";
import messages from "../../../../../messages/en/eval.json";
import { NAV } from "@/vendor/ui/nav";

// client/INSIGHTS.md 2026-08-11: mock `@/lib/hooks/evals` directly, not the
// `@/lib/hooks` barrel.
const { useEvalDashboardMock, useRunAgentEvalsMock, mutate } = vi.hoisted(() => ({
  useEvalDashboardMock: vi.fn(),
  useRunAgentEvalsMock: vi.fn(),
  mutate: vi.fn(),
}));
vi.mock("@/lib/hooks/evals", () => ({
  useEvalDashboard: useEvalDashboardMock,
  useRunAgentEvals: useRunAgentEvalsMock,
}));

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

// AppShell pulls in ShellContext (theme, command palette, "shell" i18n
// namespace) this test has no interest in wiring up — render its children
// directly, same as every other _components test in this codebase.
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { EvalDashboardView } from "./EvalDashboardView";

afterEach(() => {
  cleanup();
  pushMock.mockClear();
  mutate.mockClear();
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
    precision: null,
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
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useRunAgentEvalsMock.mockReturnValue({ mutate, isPending: false });
});

describe("nav.ts (Eval Dashboard entry)", () => {
  it("has an 'Eval Dashboard' item pointing at /evals in the SKILLS LAB group", () => {
    const skillsLab = NAV.find((g) => g.section === "SKILLS LAB");
    expect(skillsLab).toBeDefined();
    const item = skillsLab!.items.find((it) => it.key === "evals");
    expect(item).toMatchObject({ label: "Eval Dashboard", href: "/evals" });
  });
});

describe("EvalDashboardView (smoke)", () => {
  it("renders an empty state and no recent-runs table when no agent has ever run", () => {
    useEvalDashboardMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
    renderWithProviders(<EvalDashboardView />);

    expect(screen.getByText(messages.dashboard.noRuns)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText(messages.dashboard.recentRuns)).not.toBeInTheDocument();
  });

  it("renders a disabled card with an unavailable run control for a disabled agent", () => {
    useEvalDashboardMock.mockReturnValue({
      data: [
        {
          agent_id: "ag1",
          agent_name: "Security Reviewer",
          agent_enabled: false,
          cases_total: 2,
          latest_batch: batch(),
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderWithProviders(<EvalDashboardView />);

    expect(screen.getByText(messages.dashboard.disabled)).toBeInTheDocument();
    const runButton = screen.getByRole("button", { name: /run eval/i });
    expect(runButton).toBeDisabled();
  });

  it("shows '—', never '0', for a null metric on the agent card", () => {
    useEvalDashboardMock.mockReturnValue({
      data: [
        {
          agent_id: "ag1",
          agent_name: "Security Reviewer",
          agent_enabled: true,
          cases_total: 2,
          latest_batch: batch({ precision: null }),
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderWithProviders(<EvalDashboardView />);

    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });
});
