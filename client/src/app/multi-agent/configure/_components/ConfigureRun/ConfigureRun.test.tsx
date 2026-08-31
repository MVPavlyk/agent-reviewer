import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../messages/en/multiAgent.json";
import type { Agent, AgentEstimates, PrMeta, Repo } from "@devdigest/shared";

const { pushMock, replaceMock, mutateAsyncMock, searchState } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  mutateAsyncMock: vi.fn(),
  searchState: { value: "" },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  useSearchParams: () => new URLSearchParams(searchState.value),
}));

const REPOS: Repo[] = [
  {
    id: "r1",
    workspace_id: "w1",
    owner: "acme",
    name: "widgets",
    full_name: "acme/widgets",
    default_branch: "main",
    clone_path: null,
    last_polled_at: null,
    created_by: null,
  },
];

const PULLS: PrMeta[] = [
  {
    id: "pr1",
    number: 42,
    title: "Add retries",
    author: "octocat",
    branch: "feat/x",
    base: "main",
    head_sha: "abc",
    additions: 1,
    deletions: 1,
    files_count: 1,
    status: "open",
  },
];

const AGENTS: Agent[] = [
  {
    id: "a1",
    name: "Security",
    description: "Flags secrets.",
    provider: "openai",
    model: "gpt-4.1",
    system_prompt: "x",
    output_schema: null,
    enabled: true,
    version: 1,
    strategy: "single-pass",
    ci_fail_on: "critical",
    repo_intel: true,
  },
];

const ESTIMATES: AgentEstimates = {
  per_agent: [{ agent_id: "a1", time_ms: 8000, cost_usd: 0.05 }],
  total_time_ms: 8000,
  total_cost_usd: 0.05,
  partial: false,
};

vi.mock("@/lib/hooks", () => ({
  useRepos: () => ({ data: REPOS }),
  usePulls: () => ({ data: PULLS }),
  useAgents: () => ({ data: AGENTS }),
  useAgentEstimates: () => ({ data: ESTIMATES }),
  useRunMultiAgent: () => ({
    mutateAsync: mutateAsyncMock,
    isPending: false,
    isError: false,
    error: null,
  }),
}));

import { ConfigureRun } from "./ConfigureRun";

beforeEach(() => {
  searchState.value = "";
  pushMock.mockReset();
  replaceMock.mockReset();
  mutateAsyncMock.mockReset();
});
afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ multiAgent: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("ConfigureRun", () => {
  it("hides the agent list and disables Run before a PR is chosen (AC-1/AC-2/EC-1)", () => {
    renderWithIntl(<ConfigureRun />);
    expect(screen.getByText("Pick a pull request first")).toBeInTheDocument();
    expect(screen.queryByText("Security")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run multi-agent review (0)" })).toBeDisabled();
  });

  it("shows agents once a PR is selected, and Select all updates the count + estimate (AC-3/4/5/6/9)", () => {
    searchState.value = "prId=pr1";
    renderWithIntl(<ConfigureRun />);

    expect(screen.getByText("Security")).toBeInTheDocument();
    const runButton = screen.getByRole("button", { name: "Run multi-agent review (0)" });
    expect(runButton).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(screen.getByRole("button", { name: "Run multi-agent review (1)" })).not.toBeDisabled();
    expect(screen.getByText(/≈ 8\.0s · \$0\.05 · parallel fan-out/)).toBeInTheDocument();
  });

  it("starts the run and navigates to the results page on success (AC-9)", async () => {
    searchState.value = "prId=pr1";
    mutateAsyncMock.mockResolvedValue({ id: "run1" });
    renderWithIntl(<ConfigureRun />);

    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    fireEvent.click(screen.getByRole("button", { name: "Run multi-agent review (1)" }));

    await vi.waitFor(() => expect(pushMock).toHaveBeenCalledWith("/multi-agent/run1?prId=pr1"));
    expect(mutateAsyncMock).toHaveBeenCalledWith({ prId: "pr1", agentIds: ["a1"] });
  });

  it("stays on the page and shows an error on a failed start, without navigating (EC-7)", async () => {
    searchState.value = "prId=pr1";
    mutateAsyncMock.mockRejectedValue(new Error("boom"));
    renderWithIntl(<ConfigureRun />);

    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    fireEvent.click(screen.getByRole("button", { name: "Run multi-agent review (1)" }));

    await vi.waitFor(() => expect(mutateAsyncMock).toHaveBeenCalled());
    expect(pushMock).not.toHaveBeenCalled();
  });
});
