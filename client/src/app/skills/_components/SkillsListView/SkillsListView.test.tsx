import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";

const SKILLS: Skill[] = [
  {
    id: "sk1",
    name: "API Contract Rubric",
    description: "Flags handler responses that drift from schema.",
    type: "rubric",
    source: "manual",
    body: "b1",
    enabled: true,
    version: 1,
    agents_count: 0,
    pull_rate: 0,
    accept_rate: 0,
  },
  {
    id: "sk2",
    name: "No Console Logs",
    description: "Flags stray console.log calls.",
    type: "convention",
    source: "extracted",
    body: "b2",
    enabled: false,
    version: 1,
    agents_count: 0,
    pull_rate: 0,
    accept_rate: 0,
  },
];

const replaceMock = vi.fn();
let searchParam = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: replaceMock }),
  useSearchParams: () => new URLSearchParams(searchParam),
  usePathname: () => "/skills",
}));

// AppShell pulls in ShellContext (theme, command palette, "shell" i18n
// namespace) this test has no interest in wiring up — render its children
// directly, same as every other _components test in this codebase avoids it.
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/lib/hooks/skills", () => ({
  useSkills: () => ({ data: SKILLS, isLoading: false, isError: false, refetch: vi.fn() }),
  useUpdateSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateSkill: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useImportSkillPreview: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false }),
}));

import { SkillsListView } from "./SkillsListView";

afterEach(() => {
  cleanup();
  replaceMock.mockClear();
  searchParam = "";
});

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("SkillsListView (smoke)", () => {
  it("renders both seeded skills", () => {
    renderWithProviders(<SkillsListView />);
    expect(screen.getByText("API Contract Rubric")).toBeInTheDocument();
    expect(screen.getByText("No Console Logs")).toBeInTheDocument();
  });

  it("filters by the search input", () => {
    renderWithProviders(<SkillsListView />);
    fireEvent.change(screen.getByPlaceholderText("Search skills…"), { target: { value: "console" } });
    expect(screen.getByText("No Console Logs")).toBeInTheDocument();
    expect(screen.queryByText("API Contract Rubric")).not.toBeInTheDocument();
  });

  it("shows the select-a-skill prompt when nothing is selected via ?skill=", () => {
    renderWithProviders(<SkillsListView />);
    expect(screen.getByText("Select a skill")).toBeInTheDocument();
  });

  it("shows the SkillPreviewPane for the skill named by ?skill=", () => {
    searchParam = "skill=sk1";
    renderWithProviders(<SkillsListView />);
    expect(screen.getByText("Skill body (Markdown)")).toBeInTheDocument();
  });

  it("clicking a skill card updates the URL via router.replace(?skill=...)", () => {
    renderWithProviders(<SkillsListView />);
    fireEvent.click(screen.getByText("API Contract Rubric"));
    expect(replaceMock).toHaveBeenCalledWith(expect.stringContaining("skill=sk1"));
  });

  it("opens the Add Skill drawer from the header button", () => {
    renderWithProviders(<SkillsListView />);
    fireEvent.click(screen.getByText("Add Skill"));
    expect(screen.getByText("Add a skill")).toBeInTheDocument();
  });
});
