import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/ci.json";

// Only repos integrated into DevDigest are selectable — mock the repos hook
// directly (client/INSIGHTS: mock the hook module, not the network).
const useReposMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/hooks/core", () => ({ useRepos: useReposMock }));

import { TargetStep } from "./TargetStep";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ ci: messages }}>{ui}</NextIntlClientProvider>);
}

describe("TargetStep (SPEC-06 AC-13/14, EC-3)", () => {
  it("defaults to GitHub Actions selected + recommended, disables the other three with a reason, and only unlocks Continue for GHA once a repo is picked", () => {
    useReposMock.mockReturnValue({
      data: [
        { id: "1", full_name: "acme/repo" },
        { id: "2", full_name: "acme/other" },
      ],
      isLoading: false,
    });
    const onSelectTarget = vi.fn();
    const onRepoChange = vi.fn();
    const onContinue = vi.fn();
    const { rerender } = renderWithIntl(
      <TargetStep target="gha" onSelectTarget={onSelectTarget} repo="" onRepoChange={onRepoChange} onContinue={onContinue} />,
    );

    // GHA card selected + recommended badge.
    const ghaCard = screen.getByRole("button", { name: /github actions/i });
    expect(ghaCard).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("recommended")).toBeInTheDocument();

    // Other three targets are aria-disabled with a "coming soon" reason and clicking is a no-op.
    const circleCard = screen.getByRole("button", { name: /circleci/i });
    expect(circleCard).toHaveAttribute("aria-disabled", "true");
    expect(screen.getAllByText("Coming soon").length).toBe(3);
    fireEvent.click(circleCard);
    expect(onSelectTarget).not.toHaveBeenCalled();

    // The repo field is a SELECT of the integrated repos (not free text).
    const select = screen.getByRole("combobox");
    expect(screen.getByRole("option", { name: "acme/repo" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "acme/other" })).toBeInTheDocument();

    // No repo picked yet → Continue disabled with a reason.
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
    expect(screen.getByText(/select a target repository/i)).toBeInTheDocument();

    // Picking a repo reports the chosen full_name.
    fireEvent.change(select, { target: { value: "acme/repo" } });
    expect(onRepoChange).toHaveBeenCalledWith("acme/repo");

    // With a repo chosen, Continue unlocks.
    rerender(
      <NextIntlClientProvider locale="en" messages={{ ci: messages }}>
        <TargetStep target="gha" onSelectTarget={onSelectTarget} repo="acme/repo" onRepoChange={onRepoChange} onContinue={onContinue} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("button", { name: /continue/i })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("shows an empty-state note when no repositories are integrated", () => {
    useReposMock.mockReturnValue({ data: [], isLoading: false });
    renderWithIntl(
      <TargetStep target="gha" onSelectTarget={vi.fn()} repo="" onRepoChange={vi.fn()} onContinue={vi.fn()} />,
    );
    expect(screen.getByText(/no repositories integrated yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
  });
});
