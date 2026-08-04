import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, SkillStats } from "@devdigest/shared";
import skillsMessages from "../../../../../../../messages/en/skills.json";

const SKILL: Skill = {
  id: "sk1",
  name: "Secret Scan Rubric",
  description: "d",
  type: "security",
  source: "manual",
  body: "b",
  enabled: true,
  version: 1,
  agents_count: 2,
  pull_rate: 0.71,
  accept_rate: 0.74,
};

let stats: SkillStats | undefined = {
  agents_count: 2,
  pull_rate: 0.71,
  accept_rate: 0.74,
  findings_by_category: [
    { category: "security", count: 3, cost_usd: 0.012 },
    { category: "bug", count: 1, cost_usd: 0.004 },
  ],
  total_cost_usd: 0.016,
  window_days: 30,
};
let isError = false;
const refetch = vi.fn();

vi.mock("@/lib/hooks/skills", () => ({
  useSkillStats: () => ({ data: stats, isLoading: false, isError, refetch }),
}));

import { StatsTab } from "./StatsTab";

afterEach(() => {
  cleanup();
  stats = {
    agents_count: 2,
    pull_rate: 0.71,
    accept_rate: 0.74,
    findings_by_category: [
      { category: "security", count: 3, cost_usd: 0.012 },
      { category: "bug", count: 1, cost_usd: 0.004 },
    ],
    total_cost_usd: 0.016,
    window_days: 30,
  };
  isError = false;
  refetch.mockClear();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: skillsMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("StatsTab (smoke)", () => {
  it("renders agents_count/pull_rate/accept_rate as rounded percentages", () => {
    renderWithIntl(<StatsTab skill={SKILL} />);
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("71%")).toBeInTheDocument();
    expect(screen.getByText("74%")).toBeInTheDocument();
  });

  it("renders the findings-by-category breakdown with formatted cost", () => {
    renderWithIntl(<StatsTab skill={SKILL} />);
    expect(screen.getByText("Security")).toBeInTheDocument();
    expect(screen.getByText("Bug")).toBeInTheDocument();
    expect(screen.getByText("$0.012")).toBeInTheDocument();
  });

  it("always shows the approximate-attribution caveat", () => {
    renderWithIntl(<StatsTab skill={SKILL} />);
    expect(
      screen.getByText(/Attribution is approximate/),
    ).toBeInTheDocument();
  });

  it("shows an empty state when nothing is attributed yet", () => {
    stats = { ...stats!, findings_by_category: [] };
    renderWithIntl(<StatsTab skill={SKILL} />);
    expect(screen.getByText("No findings attributed to this skill yet.")).toBeInTheDocument();
  });

  it("shows an error state with retry on load failure", () => {
    isError = true;
    stats = undefined;
    renderWithIntl(<StatsTab skill={SKILL} />);
    expect(screen.getByText("Could not load stats.")).toBeInTheDocument();
  });
});
