import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalBatchRecord } from "@devdigest/shared";
import messages from "../../../../../messages/en/eval.json";
import type { EvalDashboardAgentRow } from "@/lib/hooks/evals";

// client/INSIGHTS.md 2026-08-11: mock `@/lib/hooks/evals` directly.
const { useRunAgentEvalsMock, mutate } = vi.hoisted(() => ({
  useRunAgentEvalsMock: vi.fn(),
  mutate: vi.fn(),
}));
vi.mock("@/lib/hooks/evals", () => ({
  useRunAgentEvals: useRunAgentEvalsMock,
}));

import { AgentEvalCard } from "./AgentEvalCard";

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

function row(overrides: Partial<EvalDashboardAgentRow> = {}): EvalDashboardAgentRow {
  return {
    agent_id: "ag1",
    agent_name: "Security Reviewer",
    agent_enabled: true,
    cases_total: 2,
    latest_batch: batch(),
    ...overrides,
  } as EvalDashboardAgentRow;
}

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  useRunAgentEvalsMock.mockReturnValue({ mutate, isPending: false });
});

afterEach(() => {
  cleanup();
  mutate.mockClear();
});

describe("AgentEvalCard (SPEC-05 AC-56)", () => {
  it("shows the latest batch's started_at date alongside version/pass/cost", () => {
    renderWithIntl(<AgentEvalCard row={row()} onOpen={vi.fn()} />);

    const expectedDate = new Date("2026-08-20T00:00:00Z").toLocaleString();
    expect(screen.getByText(expectedDate)).toBeInTheDocument();
  });
});
