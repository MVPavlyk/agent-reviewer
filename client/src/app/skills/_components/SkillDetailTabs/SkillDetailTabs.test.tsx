import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, SkillStats, SkillVersion } from "@devdigest/shared";
import skillsMessages from "../../../../../messages/en/skills.json";

const SKILL: Skill = {
  id: "sk1",
  name: "API Contract Rubric",
  description: "d",
  type: "rubric",
  source: "manual",
  body: "Check every changed handler.",
  enabled: true,
  version: 2,
  agents_count: 1,
  pull_rate: 0.5,
  accept_rate: 0.8,
};

const STATS: SkillStats = {
  agents_count: 1,
  pull_rate: 0.5,
  accept_rate: 0.8,
  findings_by_category: [],
  total_cost_usd: 0,
  window_days: 30,
};

const VERSIONS: SkillVersion[] = [
  { skill_id: "sk1", version: 2, body: "Check every changed handler.", change_summary: null, created_at: "2026-01-01T00:00:00Z" },
  { skill_id: "sk1", version: 1, body: "Check.", change_summary: null, created_at: "2025-12-01T00:00:00Z" },
];

vi.mock("@/lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useSkillStats: () => ({ data: STATS, isLoading: false, isError: false, refetch: vi.fn() }),
  useSkillVersions: () => ({ data: VERSIONS, isLoading: false, isError: false, refetch: vi.fn() }),
  useRestoreSkillVersion: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { SkillDetailTabs } from "./SkillDetailTabs";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: skillsMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("SkillDetailTabs (smoke)", () => {
  it("renders the Config tab by default", () => {
    renderWithIntl(<SkillDetailTabs skill={SKILL} tab="config" onTab={vi.fn()} />);
    expect(screen.getByText("Skill body (Markdown)")).toBeInTheDocument();
  });

  it("renders the Preview tab's rendered markdown body", () => {
    renderWithIntl(<SkillDetailTabs skill={SKILL} tab="preview" onTab={vi.fn()} />);
    expect(screen.getByText("Check every changed handler.")).toBeInTheDocument();
  });

  it("renders the Stats tab's usage numbers", () => {
    renderWithIntl(<SkillDetailTabs skill={SKILL} tab="stats" onTab={vi.fn()} />);
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
  });

  it("renders the Versions tab's history rows", () => {
    renderWithIntl(<SkillDetailTabs skill={SKILL} tab="versions" onTab={vi.fn()} />);
    expect(screen.getByText("v2")).toBeInTheDocument();
    expect(screen.getByText("v1")).toBeInTheDocument();
    expect(screen.getByText("Current")).toBeInTheDocument();
  });

  it("clicking a tab label calls onTab with that tab's key", () => {
    const onTab = vi.fn();
    renderWithIntl(<SkillDetailTabs skill={SKILL} tab="config" onTab={onTab} />);
    fireEvent.click(screen.getByText("Stats"));
    expect(onTab).toHaveBeenCalledWith("stats");
  });
});
