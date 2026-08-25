import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/multiAgent.json";
import type { MultiAgentRunSummary } from "@devdigest/shared";

const { searchState } = vi.hoisted(() => ({ searchState: { value: "" } }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(searchState.value),
}));

const RUNS: MultiAgentRunSummary[] = [
  {
    id: "run2",
    pr_id: "pr1",
    pr_number: 42,
    pr_title: "Add retries",
    ran_at: "2026-01-02T10:00:00.000Z",
    agent_count: 2,
    total_cost_usd: 0.12,
    total_duration_ms: 8000,
  },
  {
    id: "run1",
    pr_id: "pr1",
    pr_number: 42,
    pr_title: "Add retries",
    ran_at: "2026-01-01T10:00:00.000Z",
    agent_count: 1,
    total_cost_usd: 0.05,
    total_duration_ms: 4000,
  },
];

const { useMultiAgentRunsMock } = vi.hoisted(() => ({ useMultiAgentRunsMock: vi.fn() }));

vi.mock("@/lib/hooks", () => ({
  useMultiAgentRuns: useMultiAgentRunsMock,
}));

import { MultiAgentHistory } from "./MultiAgentHistory";

beforeEach(() => {
  searchState.value = "";
  useMultiAgentRunsMock.mockReset();
});
afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ multiAgent: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("MultiAgentHistory", () => {
  it("lists runs newest-first with a link to each run's results", () => {
    useMultiAgentRunsMock.mockReturnValue({ data: RUNS });
    renderWithIntl(<MultiAgentHistory />);

    const links = screen.getAllByRole("link", { name: /Add retries/ });
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("href", "/multi-agent/run2?prId=pr1");
    expect(links[1]).toHaveAttribute("href", "/multi-agent/run1?prId=pr1");

    expect(screen.getByRole("link", { name: /Run a multi-agent review/ })).toHaveAttribute(
      "href",
      "/multi-agent/configure",
    );
  });

  it("shows an empty state when there are no runs yet", () => {
    useMultiAgentRunsMock.mockReturnValue({ data: [] });
    renderWithIntl(<MultiAgentHistory />);

    expect(screen.getByText("No multi-agent runs yet")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Add retries/ })).not.toBeInTheDocument();
  });

  it("scopes to a PR and its 'Run' button carries the prId through, when ?prId= is set", () => {
    searchState.value = "prId=pr1";
    useMultiAgentRunsMock.mockReturnValue({ data: RUNS });
    renderWithIntl(<MultiAgentHistory />);

    expect(screen.getByText("Multi-agent runs for #42")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Run a multi-agent review/ })).toHaveAttribute(
      "href",
      "/multi-agent/configure?prId=pr1",
    );
  });
});
