import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import prReviewMessages from "../../../../../../../../messages/en/prReview.json";
import multiAgentMessages from "../../../../../../../../messages/en/multiAgent.json";
import type { Agent, AgentEstimates } from "@devdigest/shared";

const AGENTS: Agent[] = [
  {
    id: "a1",
    name: "Security",
    description: "Flags secrets, injection, authz gaps.",
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
  {
    id: "a2",
    name: "Performance",
    description: "Flags hot-path regressions.",
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
  per_agent: [],
  total_time_ms: 0,
  total_cost_usd: 0,
  partial: true,
};

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const { mutateAsyncMock } = vi.hoisted(() => ({ mutateAsyncMock: vi.fn() }));
vi.mock("@/lib/hooks", () => ({
  useAgents: () => ({ data: AGENTS }),
  useAgentEstimates: () => ({ data: ESTIMATES }),
  useRunMultiAgent: () => ({ mutateAsync: mutateAsyncMock, isPending: false, isError: false, error: null }),
}));

import { AgentMultiPicker } from "./AgentMultiPicker";

afterEach(() => {
  cleanup();
  push.mockReset();
  mutateAsyncMock.mockReset();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={{ prReview: prReviewMessages, multiAgent: multiAgentMessages }}
    >
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("AgentMultiPicker", () => {
  it("opens the picker, disables Run at 0 agents, and enables it once one is picked (AC-10/12)", () => {
    renderWithIntl(<AgentMultiPicker prId="pr1" />);

    fireEvent.click(screen.getByRole("button", { name: "Pick agents to run" }));
    const confirmButton = screen.getByRole("button", { name: "Run multi-agent review (0)" });
    expect(confirmButton).toBeDisabled();

    fireEvent.click(screen.getAllByRole("checkbox")[0]!);
    expect(screen.getByRole("button", { name: "Run multi-agent review (1)" })).not.toBeDisabled();
  });

  it("confirming starts a multi-agent run via the shared path and navigates to results (AC-11, EC-2)", async () => {
    mutateAsyncMock.mockResolvedValue({ id: "run-1" });
    renderWithIntl(<AgentMultiPicker prId="pr1" />);

    fireEvent.click(screen.getByRole("button", { name: "Pick agents to run" }));
    fireEvent.click(screen.getAllByRole("checkbox")[0]!);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Run multi-agent review (1)" }));
      await Promise.resolve();
    });

    expect(mutateAsyncMock).toHaveBeenCalledWith({ prId: "pr1", agentIds: ["a1"] });
    expect(push).toHaveBeenCalledWith("/multi-agent/run-1?prId=pr1");
  });
});
