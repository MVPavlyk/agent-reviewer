import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";

const mutate = vi.fn();
let mockUsePrIntent: () => {
  data: unknown;
  isLoading: boolean;
  notFound: boolean;
};

vi.mock("@/lib/hooks/reviews", () => ({
  usePrIntent: () => mockUsePrIntent(),
  useClassifyIntent: () => ({ mutate, isPending: false }),
}));

import { IntentCard } from "./IntentCard";

afterEach(() => {
  cleanup();
  mutate.mockClear();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("IntentCard", () => {
  it("shows the empty state and classifies on click when no intent exists yet", () => {
    mockUsePrIntent = () => ({ data: undefined, isLoading: false, notFound: true });
    renderWithIntl(<IntentCard prId="pr1" />);

    expect(screen.getByText(/intent not yet classified/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /classify intent/i }));
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("renders a classified intent: summary, scope lists, low-confidence badge, missing context, stale notice", () => {
    mockUsePrIntent = () => ({
      data: {
        pr_id: "pr1",
        summary: "Rotates the Stripe secret key.",
        in_scope: ["stripe secret rotation"],
        out_of_scope: ["payment retries"],
        confidence: "low",
        sources: ["title", "file_list", "hunk_headers"],
        missing_context: ["PR description is empty"],
        provider: "openrouter",
        model: "deepseek/deepseek-v4-flash",
        generated_at: "2024-01-01T00:00:00.000Z",
        source_updated_at: "2024-01-01T00:00:00.000Z",
      },
      isLoading: false,
      notFound: false,
    });
    renderWithIntl(<IntentCard prId="pr1" prUpdatedAt="2024-06-01T00:00:00.000Z" />);

    expect(screen.getByText("Rotates the Stripe secret key.")).toBeInTheDocument();
    expect(screen.getByText("stripe secret rotation")).toBeInTheDocument();
    expect(screen.getByText("payment retries")).toBeInTheDocument();
    expect(screen.getByText(/low confidence/i)).toBeInTheDocument();
    expect(screen.getByText("PR description is empty")).toBeInTheDocument();
    // pr.updated_at is after intent.source_updated_at → stale notice shown.
    expect(screen.getByText(/PR updated since this intent was generated/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /re-run/i })).toBeInTheDocument();
  });
});
