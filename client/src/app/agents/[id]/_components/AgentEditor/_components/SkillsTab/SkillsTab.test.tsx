import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, AgentSkillLink, Skill } from "@devdigest/shared";
import agentsMessages from "../../../../../../../../messages/en/agents.json";
import skillsMessages from "../../../../../../../../messages/en/skills.json";

const STATS = { agents_count: 0, pull_rate: 0, accept_rate: 0 };
const SKILLS: Skill[] = [
  { id: "sk1", name: "Alpha", description: "d", type: "rubric", source: "manual", body: "b", enabled: true, version: 1, ...STATS },
  { id: "sk2", name: "Beta", description: "d", type: "rubric", source: "manual", body: "b", enabled: true, version: 1, ...STATS },
  { id: "sk3", name: "Gamma", description: "d", type: "rubric", source: "manual", body: "b", enabled: true, version: 1, ...STATS },
];

let links: AgentSkillLink[] = [
  { agent_id: "ag1", skill_id: "sk1", order: 0 },
  { agent_id: "ag1", skill_id: "sk2", order: 1 },
];
const setSkillsMutate = vi.fn((vars: { agentId: string; skillIds: string[] }) => {
  links = vars.skillIds.map((skill_id, order) => ({ agent_id: vars.agentId, skill_id, order }));
});

vi.mock("@/lib/hooks/skills", () => ({
  useSkills: () => ({ data: SKILLS }),
  useAgentSkills: () => ({ data: links }),
  useSetAgentSkills: () => ({ mutate: setSkillsMutate, isPending: false }),
}));

import { SkillsTab } from "./SkillsTab";

afterEach(() => {
  cleanup();
  setSkillsMutate.mockClear();
  links = [
    { agent_id: "ag1", skill_id: "sk1", order: 0 },
    { agent_id: "ag1", skill_id: "sk2", order: 1 },
  ];
});

const AGENT: Agent = {
  id: "ag1",
  name: "Reviewer",
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

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: agentsMessages, skills: skillsMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("SkillsTab (smoke)", () => {
  it("shows linked skills attached and the rest in the attach list", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    expect(screen.getByText("2 of 3 enabled")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Alpha attached" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Beta attached" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Gamma attached" })).not.toBeChecked();
  });

  it("disables move-up on the first linked row and move-down on the last", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    expect(screen.getAllByRole("button", { name: "Move up" })[0]).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Move down" })[1]).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Move down" })[0]).not.toBeDisabled();
  });

  it("attaching a skill posts the full ordered set, appended", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    fireEvent.click(screen.getByRole("switch", { name: "Gamma attached" }));
    expect(setSkillsMutate).toHaveBeenCalledWith({ agentId: "ag1", skillIds: ["sk1", "sk2", "sk3"] });
  });

  it("moving the second linked skill up swaps its order with the first", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Move up" })[1]!);
    expect(setSkillsMutate).toHaveBeenCalledWith({ agentId: "ag1", skillIds: ["sk2", "sk1"] });
  });

  it("detaching a linked skill removes it from the set, keeping the rest", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    fireEvent.click(screen.getByRole("switch", { name: "Alpha attached" }));
    expect(setSkillsMutate).toHaveBeenCalledWith({ agentId: "ag1", skillIds: ["sk2"] });
  });

  it("filters the attach list", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    fireEvent.change(screen.getByPlaceholderText("Filter skills…"), { target: { value: "gam" } });
    expect(screen.getByText("Gamma")).toBeInTheDocument();
  });
});
