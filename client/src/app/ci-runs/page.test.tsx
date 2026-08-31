import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import ciMessages from "../../../messages/en/ci.json";

// client/INSIGHTS.md 2026-08-11: mock `@/lib/hooks/ci` directly (not the
// `@/lib/hooks` barrel).
const { useCiRunsMock } = vi.hoisted(() => ({ useCiRunsMock: vi.fn() }));
vi.mock("@/lib/hooks/ci", () => ({ useCiRuns: useCiRunsMock }));

// AppShell pulls in ShellContext (theme, command palette, "shell" i18n
// namespace) this test has no interest in wiring up — render its children
// directly, same pass-through as every other route/page test in this
// codebase (client/INSIGHTS.md).
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import CiRunsPage from "./page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CiRunsPage (route: /ci-runs)", () => {
  it("is thin — it renders CiRunsView, which reads runs through the useCiRuns hook", () => {
    useCiRunsMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
    render(
      <NextIntlClientProvider locale="en" messages={{ ci: ciMessages }}>
        <CiRunsPage />
      </NextIntlClientProvider>,
    );

    expect(useCiRunsMock).toHaveBeenCalled();
    expect(screen.getByText(ciMessages.runs.title)).toBeInTheDocument();
    expect(screen.getByText(ciMessages.runs.emptyTitle)).toBeInTheDocument();
  });
});
