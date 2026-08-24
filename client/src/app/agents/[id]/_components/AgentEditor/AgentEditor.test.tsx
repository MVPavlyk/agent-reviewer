import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent, Skill } from "@devdigest/shared";
import agentsMessages from "../../../../../../messages/en/agents.json";
import skillsMessages from "../../../../../../messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";

// Mock the data hooks so the editor renders without a network/query client.
vi.mock("@/lib/hooks/agents", () => ({
  useUpdateAgent: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, data: undefined }),
  useProviderModels: () => ({ data: [{ id: "gpt-4.1", provider: "openai" }] }),
}));

// SkillsTab (L-02) pulls the "skills" namespace — a test's NextIntlClientProvider
// only carries the namespaces it's handed, so the Config-only test would break
// silently-late without this (see client/INSIGHTS.md). It also needs live data
// hooks, mocked here rather than pulled through a real QueryClientProvider.
const SKILL_STATS = { agents_count: 0, pull_rate: 0, accept_rate: 0 };
const SKILLS: Skill[] = [
  { id: "sk1", name: "API Contract Rubric", description: "d", type: "rubric", source: "manual", body: "b", enabled: true, version: 1, ...SKILL_STATS },
  { id: "sk2", name: "No Console Logs", description: "d", type: "convention", source: "manual", body: "b", enabled: true, version: 1, ...SKILL_STATS },
];
vi.mock("@/lib/hooks/skills", () => ({
  useSkills: () => ({ data: SKILLS }),
  useAgentSkills: () => ({ data: [{ agent_id: "ag1", skill_id: "sk1", order: 0 }] }),
  useSetAgentSkills: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { AgentEditor } from "./AgentEditor";

afterEach(cleanup);

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

function renderWithIntl(ui: React.ReactElement) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ agents: agentsMessages, skills: skillsMessages }}>
        <ToastProvider>{ui}</ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("A2 Agent Editor (smoke)", () => {
  it("renders the Config tab fields", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    expect(screen.getByText("Config")).toBeInTheDocument();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Save agent")).toBeInTheDocument();
  });

  it("renders the Skills tab: 1 linked skill attached, 1 attachable", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="skills" onTab={() => {}} />);
    expect(screen.getByText("1 of 2 enabled")).toBeInTheDocument();
    // The linked skill's reorder buttons are both disabled (only one linked item).
    expect(screen.getByRole("switch", { name: "API Contract Rubric attached" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "No Console Logs attached" })).not.toBeChecked();
  });

  it("shows exactly 4 tabs (Config/Skills/Context/Evals) — no Stats/CI (AC-45)", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    expect(screen.getByRole("button", { name: "Config" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skills" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Context" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Evals" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Stats" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "CI" })).not.toBeInTheDocument();
  });
});
