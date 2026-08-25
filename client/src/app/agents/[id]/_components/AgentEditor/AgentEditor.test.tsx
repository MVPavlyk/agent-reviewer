import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent, Skill } from "@devdigest/shared";
import agentsMessages from "../../../../../../messages/en/agents.json";
import skillsMessages from "../../../../../../messages/en/skills.json";
import ciMessages from "../../../../../../messages/en/ci.json";
import { ToastProvider } from "@/lib/toast";

// Mock the data hooks so the editor renders without a network/query client.
vi.mock("@/lib/hooks/agents", () => ({
  useUpdateAgent: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, data: undefined }),
  useProviderModels: () => ({ data: [{ id: "gpt-4.1", provider: "openai" }] }),
}));

// CI tab (Pass 8) pulls the "ci" namespace and `useAgentCi` — mocked here so
// the CI-tab test doesn't need a real QueryClientProvider network round-trip
// (client/INSIGHTS.md 2026-08-11: mock `@/lib/hooks/ci` directly).
vi.mock("@/lib/hooks/ci", () => ({
  useAgentCi: () => ({
    data: [
      {
        installation: {
          id: "inst1",
          agent_id: "ag1",
          repo: "acme/repo-a",
          target_type: "gha",
          installed_at: "2026-08-20T00:00:00Z",
          workflow_version: "1",
          pr_url: null,
        },
        last_run: null,
        runs: [],
      },
      {
        installation: {
          id: "inst2",
          agent_id: "ag1",
          repo: "acme/repo-b",
          target_type: "gha",
          installed_at: "2026-08-20T00:00:00Z",
          workflow_version: "1",
          pr_url: null,
        },
        last_run: null,
        runs: [],
      },
    ],
    isLoading: false,
  }),
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
      <NextIntlClientProvider locale="en" messages={{ agents: agentsMessages, skills: skillsMessages, ci: ciMessages }}>
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

  it("shows exactly 5 tabs (Config/Skills/Context/Evals/CI) — no Stats (AC-45, revised Pass 8)", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    expect(screen.getByRole("button", { name: "Config" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skills" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Context" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Evals" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "CI" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Stats" })).not.toBeInTheDocument();
  });

  it("renders the CI tab: heading, Active-in pill, and mounts the wizard from Add repository (AC-4/AC-5/AC-8)", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="ci" onTab={() => {}} />);
    expect(screen.getByText("CI deployment")).toBeInTheDocument();
    expect(screen.getByText("Active in 2 repos")).toBeInTheDocument();
    expect(screen.getByText("acme/repo-a")).toBeInTheDocument();
  });
});
