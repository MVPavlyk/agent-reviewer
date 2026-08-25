import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/multiAgent.json";
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
  per_agent: [{ agent_id: "a1", time_ms: 12000, cost_usd: 0.02 }],
  total_time_ms: 12000,
  total_cost_usd: 0.02,
  partial: true,
};

vi.mock("@/lib/hooks", () => ({
  useAgents: () => ({ data: AGENTS }),
  useAgentEstimates: () => ({ data: ESTIMATES }),
}));

import { AgentPicker } from "./AgentPicker";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ multiAgent: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("AgentPicker", () => {
  it("lists every agent with name, blurb, and its time·cost cell (— when no history)", () => {
    renderWithIntl(<AgentPicker selectedIds={[]} onChange={vi.fn()} />);

    expect(screen.getByText("Security")).toBeInTheDocument();
    expect(screen.getByText("Flags secrets, injection, authz gaps.")).toBeInTheDocument();
    expect(screen.getByText("Performance")).toBeInTheDocument();
    // a1 has history → real cell; a2 has none → dash (AC-7).
    expect(screen.getByText("12.0s · $0.02")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("toggling a checkbox reports the new selection", () => {
    const onChange = vi.fn();
    renderWithIntl(<AgentPicker selectedIds={[]} onChange={onChange} />);

    fireEvent.click(screen.getAllByRole("checkbox")[0]!);
    expect(onChange).toHaveBeenCalledWith(["a1"]);
  });

  it("Select all selects every agent, and again clears them (AC-4)", () => {
    const onChange = vi.fn();
    renderWithIntl(<AgentPicker selectedIds={[]} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(onChange).toHaveBeenCalledWith(["a1", "a2"]);

    cleanup();
    renderWithIntl(<AgentPicker selectedIds={["a1", "a2"]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
