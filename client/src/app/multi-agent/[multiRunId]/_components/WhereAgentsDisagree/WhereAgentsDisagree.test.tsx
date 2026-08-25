import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../messages/en/multiAgent.json";
import type { Conflict } from "@devdigest/shared";
import { WhereAgentsDisagree } from "./WhereAgentsDisagree";
import { isConflict } from "./helpers";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ multiAgent: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const CONFLICT: Conflict = {
  file: "src/auth.ts",
  line: 42,
  title: "Missing authz check",
  takes: [
    { agent_id: "a1", persona: "Security", verdict: "CRITICAL", note: "No authz check here." },
    { agent_id: "a2", persona: "Performance", verdict: "ignored", note: "" },
  ],
};

const AGREEMENT: Conflict = {
  file: "src/util.ts",
  line: 7,
  title: "Unused import",
  takes: [
    { agent_id: "a1", persona: "Security", verdict: "SUGGESTION", note: "Dead import." },
    { agent_id: "a2", persona: "Performance", verdict: "SUGGESTION", note: "Remove it." },
  ],
};

describe("isConflict", () => {
  it("flags a group with at least one did-not-flag as a conflict", () => {
    expect(isConflict(CONFLICT.takes)).toBe(true);
  });
  it("does not flag a unanimous group as a conflict", () => {
    expect(isConflict(AGREEMENT.takes)).toBe(false);
  });
});

describe("WhereAgentsDisagree", () => {
  it("shows every group with per-agent verdicts, including did-not-flag (AC-25/26)", () => {
    renderWithIntl(<WhereAgentsDisagree conflicts={[CONFLICT, AGREEMENT]} running={false} />);
    expect(screen.getByText("Missing authz check")).toBeInTheDocument();
    expect(screen.getByText("did not flag")).toBeInTheDocument();
    expect(screen.getByText("Unused import")).toBeInTheDocument();
  });

  it("Show only conflicts hides unanimous groups (AC-27)", () => {
    renderWithIntl(<WhereAgentsDisagree conflicts={[CONFLICT, AGREEMENT]} running={false} />);
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.getByText("Missing authz check")).toBeInTheDocument();
    expect(screen.queryByText("Unused import")).not.toBeInTheDocument();
  });

  it("shows an empty state when there are no groups yet (AC-28/EC-4)", () => {
    renderWithIntl(<WhereAgentsDisagree conflicts={[]} running={true} />);
    expect(screen.getByText(/still in progress/i)).toBeInTheDocument();
  });
});
