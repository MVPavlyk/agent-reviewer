import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/ci.json";

import { ConfigureStep } from "./ConfigureStep";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ ci: messages }}>{ui}</NextIntlClientProvider>);
}

describe("ConfigureStep (SPEC-06 AC-18/19/20/21, EC-5, NFR-3)", () => {
  it("shows trigger chips + post_as radios reachable via getByRole, reports trigger toggles upward for the server to re-preview, and blocks Continue when every trigger is off", () => {
    const onToggleTrigger = vi.fn();
    const onChangePostAs = vi.fn();
    const onBack = vi.fn();
    const onContinue = vi.fn();

    const { rerender } = renderWithIntl(
      <ConfigureStep
        triggers={["opened", "synchronize"]}
        onToggleTrigger={onToggleTrigger}
        postAs="github_review"
        onChangePostAs={onChangePostAs}
        onBack={onBack}
        onContinue={onContinue}
      />,
    );

    // Two defaults selected, reopened off (AC-18).
    expect(screen.getByRole("button", { name: /pull_request:opened/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /pull_request:reopened/i })).toBeInTheDocument();

    // Toggling a trigger reports upward (container debounces + re-requests
    // the server preview, AC-19/D-C1) — this step never generates YAML itself.
    fireEvent.click(screen.getByRole("button", { name: /pull_request:reopened/i }));
    expect(onToggleTrigger).toHaveBeenCalledWith("reopened");

    // Post-results radios are real radio inputs — keyboard reachable, labeled (NFR-3).
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);
    expect(screen.getByRole("radio", { name: /github review/i })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: /pr comment/i }));
    expect(onChangePostAs).toHaveBeenCalledWith("pr_comment");

    // Fail-CI-on / required-status-check tie-in is informational text, not an action.
    expect(screen.getByRole("note")).toHaveTextContent(/fail ci on/i);

    // Continue enabled while at least one trigger remains.
    expect(screen.getByRole("button", { name: /continue/i })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(onContinue).toHaveBeenCalledTimes(1);

    // All triggers off → Continue disabled with a reason (AC-20/EC-5).
    rerender(
      <NextIntlClientProvider locale="en" messages={{ ci: messages }}>
        <ConfigureStep
          triggers={[]}
          onToggleTrigger={onToggleTrigger}
          postAs="github_review"
          onChangePostAs={onChangePostAs}
          onBack={onBack}
          onContinue={onContinue}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
    expect(screen.getByText(/select at least one trigger/i)).toBeInTheDocument();
  });
});
