import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { ToastProvider } from "@/lib/toast";
import { FindingCard } from "./FindingCard";

afterEach(cleanup);

// Mock the concrete hooks module, not the `@/lib/hooks` barrel — mocking the
// barrel would replace every other hook it re-exports too (client/INSIGHTS.md
// 2026-08-11). `FindingCard` imports from the barrel, which itself imports
// from "./evals" — mocking that submodule is transitively visible.
const createEvalCaseMutateAsync = vi.fn();
vi.mock("@/lib/hooks/evals", () => ({
  useCreateEvalCaseFromFinding: () => ({
    mutateAsync: createEvalCaseMutateAsync,
    isPending: false,
  }),
}));

const FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded Stripe secret key",
  file: "src/config.ts",
  start_line: 11,
  end_line: 11,
  rationale: "A **live** Stripe key is committed in source.",
  suggestion: "Move the key to an environment variable.",
  confidence: 0.95,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("FindingCard (smoke, both themes)", () => {
  (["dark", "light"] as const).forEach((theme) => {
    it(`renders severity + file:line + rationale in ${theme}`, () => {
      renderWithIntl(
        <div data-theme={theme}>
          <FindingCard f={FINDING} defaultExpanded onAction={() => {}} />
        </div>,
      );
      expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
      expect(screen.getByText("src/config.ts:11")).toBeInTheDocument();
      // category label is shown alongside the severity badge
      expect(screen.getByText("security")).toBeInTheDocument();
    });
  });

  it("fires accept/dismiss actions", () => {
    const onAction = vi.fn();
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded onAction={onAction} />);
    fireEvent.click(screen.getByText("Accept"));
    expect(onAction).toHaveBeenCalledWith("accept");
    fireEvent.click(screen.getByText("Dismiss"));
    expect(onAction).toHaveBeenCalledWith("dismiss");
  });
});

describe("FindingCard — Turn into eval case (L-06)", () => {
  afterEach(() => {
    createEvalCaseMutateAsync.mockReset();
  });

  it("unresolved finding: clicking shows the hint and does not call the mutation (AC-15)", () => {
    renderWithIntl(
      <FindingCard f={FINDING} defaultExpanded reviewAgentId="agent-1" onAction={() => {}} />,
    );
    const button = screen.getByRole("button", { name: "Turn into eval case" });
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    expect(createEvalCaseMutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText("Accept or Dismiss first")).toBeInTheDocument();
  });

  it("reviewAgentId={null}: button is disabled (AC-16)", () => {
    const resolved: FindingRecord = { ...FINDING, accepted_at: "2026-01-01T00:00:00Z" };
    renderWithIntl(<FindingCard f={resolved} defaultExpanded reviewAgentId={null} onAction={() => {}} />);
    expect(screen.getByRole("button", { name: "Turn into eval case" })).toBeDisabled();
  });

  it("hook-detector finding (kind !== 'finding'): no button at all (EC-23)", () => {
    const hookFinding: FindingRecord = { ...FINDING, kind: "secret_leak" };
    renderWithIntl(
      <FindingCard f={hookFinding} defaultExpanded reviewAgentId="agent-1" onAction={() => {}} />,
    );
    expect(screen.queryByRole("button", { name: "Turn into eval case" })).not.toBeInTheDocument();
  });

  it("resolved finding + agent present: success shows toast action and a persistent link (AC-17, AC-17a)", async () => {
    createEvalCaseMutateAsync.mockResolvedValue({ case_id: "case-1" });
    const resolved: FindingRecord = { ...FINDING, accepted_at: "2026-01-01T00:00:00Z" };
    renderWithIntl(<FindingCard f={resolved} defaultExpanded reviewAgentId="agent-1" onAction={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Turn into eval case" }));
    expect(createEvalCaseMutateAsync).toHaveBeenCalledWith("f1");

    // One-shot toast with an "Open in Evals" action…
    expect(await screen.findByText("Open in Evals")).toBeInTheDocument();
    // …and a separate persistent "Eval case created" link that survives independently of the toast.
    const link = screen.getByRole("link", { name: "Eval case created" });
    expect(link).toHaveAttribute("href", "/agents/agent-1?tab=evals");
    await waitFor(() => expect(screen.queryByText("Accept or Dismiss first")).not.toBeInTheDocument());
  });
});
