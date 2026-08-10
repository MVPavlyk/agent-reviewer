import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import { SkillCard } from "./SkillCard";

afterEach(cleanup);

const SKILL: Skill = {
  id: "sk1",
  name: "API Contract Rubric",
  description: "Flags handler responses that drift from their declared schema.",
  type: "rubric",
  source: "manual",
  body: "Check every changed handler.",
  enabled: true,
  version: 1,
  agents_count: 3,
  pull_rate: 0.71,
  accept_rate: 0.74,
};

function renderWithIntl(ui: React.ReactElement) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("SkillCard (smoke)", () => {
  it("renders the skill name, type badge, and an accessible enabled toggle", () => {
    renderWithIntl(<SkillCard skill={SKILL} />);
    expect(screen.getByText("API Contract Rubric")).toBeInTheDocument();
    expect(screen.getByText("rubric")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "API Contract Rubric enabled" })).toBeInTheDocument();
    expect(screen.getByText("3 agents · 71% pull · 74% accept")).toBeInTheDocument();
  });

  it("shows a needs-vetting badge for a non-manual source", () => {
    renderWithIntl(<SkillCard skill={{ ...SKILL, source: "extracted" }} />);
    expect(screen.getByText("needs vetting")).toBeInTheDocument();
  });

  it("does not show a needs-vetting badge for a manual skill", () => {
    renderWithIntl(<SkillCard skill={SKILL} />);
    expect(screen.queryByText("needs vetting")).not.toBeInTheDocument();
  });

  it("calls onClick when the card is clicked, but not when the toggle is clicked", () => {
    const onClick = vi.fn();
    renderWithIntl(<SkillCard skill={SKILL} onClick={onClick} />);
    screen.getByRole("switch").click();
    expect(onClick).not.toHaveBeenCalled();
    screen.getByText("API Contract Rubric").click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
