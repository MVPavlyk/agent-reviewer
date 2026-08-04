import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, SkillVersion } from "@devdigest/shared";
import skillsMessages from "../../../../../../../messages/en/skills.json";

const SKILL: Skill = {
  id: "sk1",
  name: "Restorable Rubric",
  description: "d",
  type: "rubric",
  source: "manual",
  body: "v3 body",
  enabled: true,
  version: 3,
  agents_count: 0,
  pull_rate: 0,
  accept_rate: 0,
};

const VERSIONS: SkillVersion[] = [
  { skill_id: "sk1", version: 3, body: "v3 body", change_summary: null, created_at: "2026-01-03T00:00:00Z" },
  { skill_id: "sk1", version: 2, body: "v2 body\nextra line", change_summary: "tightened wording", created_at: "2026-01-02T00:00:00Z" },
  { skill_id: "sk1", version: 1, body: "v1 body", change_summary: null, created_at: "2026-01-01T00:00:00Z" },
];

const restoreMutate = vi.fn();

vi.mock("@/lib/hooks/skills", () => ({
  useSkillVersions: () => ({ data: VERSIONS, isLoading: false, isError: false, refetch: vi.fn() }),
  useRestoreSkillVersion: () => ({ mutate: restoreMutate, isPending: false }),
}));

import { VersionsTab } from "./VersionsTab";

afterEach(() => {
  cleanup();
  restoreMutate.mockClear();
  vi.restoreAllMocks();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: skillsMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("VersionsTab (smoke)", () => {
  it("renders every version, newest first, with the user-entered change_summary", () => {
    renderWithIntl(<VersionsTab skill={SKILL} />);
    expect(screen.getByText("v3")).toBeInTheDocument();
    expect(screen.getByText("v2")).toBeInTheDocument();
    expect(screen.getByText("v1")).toBeInTheDocument();
    expect(screen.getByText("tightened wording")).toBeInTheDocument();
    expect(screen.getAllByText("No summary")).toHaveLength(2);
  });

  it("marks the current version and disables its Restore button", () => {
    renderWithIntl(<VersionsTab skill={SKILL} />);
    expect(screen.getByText("Current")).toBeInTheDocument();
    const restoreButtons = screen.getAllByRole("button", { name: "Restore" });
    expect(restoreButtons).toHaveLength(3);
    expect(restoreButtons[0]).toBeDisabled(); // v3 row = current
    expect(restoreButtons[1]).not.toBeDisabled();
  });

  it("clicking Diff on an older version renders the line diff against current", () => {
    renderWithIntl(<VersionsTab skill={SKILL} />);
    const diffButtons = screen.getAllByRole("button", { name: "Changes vs. current" });
    fireEvent.click(diffButtons[0]!); // v2 row
    expect(screen.getByText(/extra line/)).toBeInTheDocument();
  });

  it("confirming the restore prompt calls the restore mutation with id + version", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderWithIntl(<VersionsTab skill={SKILL} />);
    const restoreButtons = screen.getAllByRole("button", { name: "Restore" });
    fireEvent.click(restoreButtons[1]!); // v2 row
    expect(restoreMutate).toHaveBeenCalledWith({ id: "sk1", version: 2 });
  });

  it("declining the restore prompt does not call the mutation", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderWithIntl(<VersionsTab skill={SKILL} />);
    const restoreButtons = screen.getAllByRole("button", { name: "Restore" });
    fireEvent.click(restoreButtons[1]!);
    expect(restoreMutate).not.toHaveBeenCalled();
  });
});
