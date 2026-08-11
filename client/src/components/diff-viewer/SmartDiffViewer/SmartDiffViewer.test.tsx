import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import shell from "../../../../messages/en/shell.json";
import { SmartDiffViewer } from "./SmartDiffViewer";
import type { SmartDiff, PrFile } from "@devdigest/shared";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ shell }}>{ui}</NextIntlClientProvider>);
}

const FILES: PrFile[] = [
  {
    path: "src/modules/pulls/service.ts",
    additions: 1,
    deletions: 0,
    patch: "@@ -1,1 +1,2 @@\n+core added line",
  },
  {
    path: "src/modules/index.ts",
    additions: 1,
    deletions: 0,
    patch: "@@ -1,1 +1,2 @@\n+wiring added line",
  },
  {
    path: "pnpm-lock.yaml",
    additions: 1,
    deletions: 0,
    patch: "@@ -1,1 +1,2 @@\n+boilerplate added line",
  },
];

const SMART_DIFF: SmartDiff = {
  groups: [
    {
      role: "core",
      files: [
        {
          path: "src/modules/pulls/service.ts",
          pseudocode_summary: null,
          additions: 1,
          deletions: 0,
          finding_lines: [2, 3],
        },
      ],
    },
    {
      role: "wiring",
      files: [
        {
          path: "src/modules/index.ts",
          pseudocode_summary: null,
          additions: 1,
          deletions: 0,
          finding_lines: [],
        },
      ],
    },
    {
      role: "boilerplate",
      files: [
        {
          path: "pnpm-lock.yaml",
          pseudocode_summary: null,
          additions: 1,
          deletions: 0,
          finding_lines: [],
        },
      ],
    },
  ],
  split_suggestion: { too_big: false, total_lines: 3, proposed_splits: [] },
};

describe("SmartDiffViewer", () => {
  it("renders all three role sections, expands core by default, and collapses boilerplate", () => {
    renderWithIntl(<SmartDiffViewer smartDiff={SMART_DIFF} files={FILES} />);

    expect(screen.getByText("Core")).toBeInTheDocument();
    expect(screen.getByText("Wiring")).toBeInTheDocument();
    expect(screen.getByText("Boilerplate")).toBeInTheDocument();
    expect(screen.getByText("The substance of the change — review closely")).toBeInTheDocument();
    expect(screen.getByText("Generated / mechanical — skim")).toBeInTheDocument();

    // Core file has findings → expanded by default: its diff lines are rendered.
    expect(screen.getByText("core added line")).toBeInTheDocument();
    // Boilerplate file starts collapsed regardless of size.
    expect(screen.queryByText("boilerplate added line")).not.toBeInTheDocument();

    // "2 findings" badge on the core file (finding_lines has 2 entries).
    expect(screen.getByText("2 findings")).toBeInTheDocument();
  });

  it("does not render a group with no files", () => {
    const withoutWiring: SmartDiff = {
      ...SMART_DIFF,
      groups: SMART_DIFF.groups.filter((g) => g.role !== "wiring"),
    };
    renderWithIntl(<SmartDiffViewer smartDiff={withoutWiring} files={FILES} />);
    expect(screen.queryByText("Wiring")).not.toBeInTheDocument();
  });
});
