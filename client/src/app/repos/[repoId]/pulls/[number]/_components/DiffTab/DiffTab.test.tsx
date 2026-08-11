import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import shell from "../../../../../../../../messages/en/shell.json";
import type { SmartDiff, PrFile, ReviewRecord, PrReviewComment } from "@devdigest/shared";

const FILES: PrFile[] = [
  {
    path: "src/modules/pulls/service.ts",
    additions: 1,
    deletions: 0,
    patch: "@@ -1,1 +1,2 @@\n+core added line",
  },
];

const SMART_DIFF: SmartDiff = {
  groups: [
    {
      role: "core",
      files: [
        { path: "src/modules/pulls/service.ts", pseudocode_summary: null, additions: 1, deletions: 0, finding_lines: [] },
      ],
    },
  ],
  split_suggestion: { too_big: false, total_lines: 1, proposed_splits: [] },
};

const { useSmartDiffMock, usePrReviewsMock, replaceMock } = vi.hoisted(() => ({
  useSmartDiffMock: vi.fn(),
  usePrReviewsMock: vi.fn(),
  replaceMock: vi.fn(),
}));

let currentSearch = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => "/repos/r1/pulls/1",
  useSearchParams: () => new URLSearchParams(currentSearch),
}));

// DiffTab only pulls `useSmartDiff` from the barrel — no need to preserve the
// rest of it (and preserving it via importOriginal would also re-import the
// mocked "./reviews" module and blow up on its missing exports).
vi.mock("@/lib/hooks", () => ({ useSmartDiff: useSmartDiffMock }));

vi.mock("@/lib/hooks/reviews", () => ({
  usePrComments: (): { data: PrReviewComment[] } => ({ data: [] }),
  useCreatePrComment: () => ({ isPending: false, mutateAsync: vi.fn() }),
  usePrReviews: usePrReviewsMock,
}));

import { DiffTab } from "./DiffTab";

afterEach(() => {
  cleanup();
  useSmartDiffMock.mockReset();
  usePrReviewsMock.mockReset();
  replaceMock.mockClear();
  currentSearch = "";
});

function renderWithIntl() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell }}>
      <DiffTab prId="pr1" filesCount={1} files={FILES} canComment={false} />
    </NextIntlClientProvider>,
  );
}

describe("DiffTab — Smart Diff order toggle", () => {
  it("defaults to grouped Smart Diff sections when the smart-diff query resolves", () => {
    useSmartDiffMock.mockReturnValue({ data: SMART_DIFF, isLoading: false, isError: false });
    usePrReviewsMock.mockReturnValue({ data: [] as ReviewRecord[] });
    renderWithIntl();
    expect(screen.getByText("Core")).toBeInTheDocument();
  });

  it("renders the flat DiffViewer when ?diffOrder=original", () => {
    currentSearch = "diffOrder=original";
    useSmartDiffMock.mockReturnValue({ data: SMART_DIFF, isLoading: false, isError: false });
    usePrReviewsMock.mockReturnValue({ data: [] as ReviewRecord[] });
    renderWithIntl();
    expect(screen.queryByText("Core")).not.toBeInTheDocument();
    expect(screen.getByText("src/modules/pulls/service.ts")).toBeInTheDocument();
  });

  it("falls back to the flat DiffViewer while Smart Diff is loading or errored", () => {
    useSmartDiffMock.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    usePrReviewsMock.mockReturnValue({ data: [] as ReviewRecord[] });
    renderWithIntl();
    expect(screen.queryByText("Core")).not.toBeInTheDocument();
    expect(screen.getByText("src/modules/pulls/service.ts")).toBeInTheDocument();
  });

  it("clicking the Original order segment writes ?diffOrder=original to the URL", () => {
    useSmartDiffMock.mockReturnValue({ data: SMART_DIFF, isLoading: false, isError: false });
    usePrReviewsMock.mockReturnValue({ data: [] as ReviewRecord[] });
    renderWithIntl();
    fireEvent.click(screen.getByRole("button", { name: "Original order" }));
    expect(replaceMock).toHaveBeenCalledWith("/repos/r1/pulls/1?diffOrder=original");
  });
});
