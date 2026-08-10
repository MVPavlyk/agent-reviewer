import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../messages/en/conventions.json";

const CONVENTION: ConventionCandidate = {
  id: "c1",
  scan_id: "s1",
  title: "Errors wrapped in Result<T>",
  rule: "Route handlers never throw — they return Result<T, ApiError>.",
  evidence_path: "src/api/users.ts",
  start_line: 23,
  end_line: 31,
  evidence_snippet: "const user = await db.users.find(id);",
  confidence: 0.91,
  status: "pending",
  created_at: "2026-08-01T00:00:00Z",
  decided_at: null,
};

const mutate = vi.fn();
vi.mock("@/lib/hooks/conventions", () => ({
  useUpdateConvention: () => ({ mutate, isPending: false, variables: undefined }),
}));

import { ConventionCard } from "./ConventionCard";

afterEach(() => {
  cleanup();
  mutate.mockClear();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("ConventionCard (smoke)", () => {
  it("renders the title, file:line evidence, snippet, and confidence", () => {
    renderWithIntl(<ConventionCard convention={CONVENTION} repoId="r1" />);
    expect(screen.getByText("Errors wrapped in Result<T>")).toBeInTheDocument();
    expect(screen.getByText("src/api/users.ts:23-31")).toBeInTheDocument();
    expect(screen.getByText("const user = await db.users.find(id);")).toBeInTheDocument();
    expect(screen.getByText("91% conf")).toBeInTheDocument();
  });

  it("clicking Accept calls the mutation with action 'accept'", () => {
    renderWithIntl(<ConventionCard convention={CONVENTION} repoId="r1" />);
    fireEvent.click(screen.getByText("Accept"));
    expect(mutate).toHaveBeenCalledWith({ id: "c1", repoId: "r1", action: "accept" });
  });

  it("the Accept/Reject buttons always read as the imperative action, never 'Accepted'/'Rejected'", () => {
    renderWithIntl(<ConventionCard convention={CONVENTION} repoId="r1" />);
    expect(screen.getByText("Accept")).toBeInTheDocument();
    expect(screen.getByText("Reject")).toBeInTheDocument();
    expect(screen.queryByText("Accepted")).not.toBeInTheDocument();
  });

  it("Accept button is not highlighted while pending (secondary, transparent-ish background)", () => {
    renderWithIntl(<ConventionCard convention={CONVENTION} repoId="r1" />);
    const acceptBtn = screen.getByRole("button", { name: /^Accept$/ });
    expect(acceptBtn.style.background).toBe("var(--bg-elevated)");
  });

  it("Accept button turns solid blue (kind=primary) once the convention is accepted", () => {
    renderWithIntl(<ConventionCard convention={{ ...CONVENTION, status: "accepted" }} repoId="r1" />);
    const acceptBtn = screen.getByRole("button", { name: /^Accept$/ });
    expect(acceptBtn.style.background).toBe("var(--accent)");
  });

  it("Reject button turns danger-colored once the convention is rejected", () => {
    renderWithIntl(<ConventionCard convention={{ ...CONVENTION, status: "rejected" }} repoId="r1" />);
    const rejectBtn = screen.getByRole("button", { name: /^Reject$/ });
    expect(rejectBtn.style.color).toBe("var(--crit)");
  });

  it("clicking Reject calls the mutation with action 'reject'", () => {
    renderWithIntl(<ConventionCard convention={CONVENTION} repoId="r1" />);
    fireEvent.click(screen.getByText("Reject"));
    expect(mutate).toHaveBeenCalledWith({ id: "c1", repoId: "r1", action: "reject" });
  });

  it("has no separate selection checkbox — the Accept button's highlight is the only selection signal", () => {
    renderWithIntl(<ConventionCard convention={{ ...CONVENTION, status: "accepted" }} repoId="r1" />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("omits the snippet block entirely when there is no evidence path", () => {
    renderWithIntl(
      <ConventionCard convention={{ ...CONVENTION, evidence_path: null, evidence_snippet: null }} repoId="r1" />,
    );
    expect(screen.queryByText("const user = await db.users.find(id);")).not.toBeInTheDocument();
  });

  it("evidence is a plain, non-navigating control when repoFullName/headSha are missing", () => {
    renderWithIntl(<ConventionCard convention={CONVENTION} repoId="r1" />);
    const evidence = screen.getByText("src/api/users.ts:23-31");
    expect(evidence.tagName).toBe("BUTTON");
  });

  it("evidence links to the real file on GitHub, pinned to the last-indexed sha, when repoFullName/headSha are given", () => {
    renderWithIntl(
      <ConventionCard
        convention={CONVENTION}
        repoId="r1"
        repoFullName="acme/payments-api"
        headSha="deadbeef"
      />,
    );
    const link = screen.getByRole("link", { name: "src/api/users.ts:23-31" });
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/acme/payments-api/blob/deadbeef/src/api/users.ts#L23-L31",
    );
  });
});
