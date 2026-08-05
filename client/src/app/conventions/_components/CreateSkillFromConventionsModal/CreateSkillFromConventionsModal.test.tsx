import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/conventions.json";
import skillsMessages from "../../../../../messages/en/skills.json";

const DRAFT = {
  name: "3 extracted conventions",
  description: "Merged from 3 accepted conventions.",
  type: "convention" as const,
  source: "extracted" as const,
  body: "## Rule one\n\nDo the thing.",
};

const draftMutateAsync = vi.fn();
const createMutateAsync = vi.fn();

// `mutateAsync` (not `mutate`/`.data`) is the load-bearing API here — the
// component seeds its form off the resolved Promise directly rather than
// reading the mutation hook's own reactive fields, working around a React
// StrictMode quirk where a mutation fired from a mount effect doesn't
// reliably re-render the component when it settles (see the component's
// comment for the full explanation).
vi.mock("@/lib/hooks/conventions", () => ({
  useConventionSkillDraft: () => ({ mutateAsync: draftMutateAsync }),
  useCreateSkillFromConventions: () => ({ mutateAsync: createMutateAsync, isPending: false }),
}));

import { CreateSkillFromConventionsModal } from "./CreateSkillFromConventionsModal";

afterEach(() => {
  cleanup();
  draftMutateAsync.mockReset();
  createMutateAsync.mockReset();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages, skills: skillsMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("CreateSkillFromConventionsModal (smoke)", () => {
  it("fetches the merge preview once on open and seeds the form from the resolved draft", async () => {
    draftMutateAsync.mockResolvedValueOnce(DRAFT);
    renderWithIntl(
      <CreateSkillFromConventionsModal
        repoName="acme/payments-api"
        conventionIds={["c1", "c2", "c3"]}
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />,
    );
    expect(draftMutateAsync).toHaveBeenCalledWith(["c1", "c2", "c3"]);
    expect(draftMutateAsync).toHaveBeenCalledTimes(1);

    expect(await screen.findByDisplayValue(DRAFT.name)).toBeInTheDocument();
    expect(screen.getByDisplayValue(DRAFT.description)).toBeInTheDocument();
    // getByDisplayValue is flaky against jsdom's multi-line textarea value —
    // assert the textarea's actual `.value` directly instead.
    expect(document.querySelector("textarea")?.value).toBe(DRAFT.body);
  });

  it("shows the merged-from banner mentioning the repo and convention count", () => {
    draftMutateAsync.mockResolvedValueOnce(DRAFT);
    renderWithIntl(
      <CreateSkillFromConventionsModal
        repoName="acme/payments-api"
        conventionIds={["c1", "c2", "c3"]}
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/Merged from 3 accepted conventions in acme\/payments-api/),
    ).toBeInTheDocument();
  });

  it("Cancel calls onClose without creating anything", () => {
    draftMutateAsync.mockResolvedValueOnce(DRAFT);
    const onClose = vi.fn();
    renderWithIntl(
      <CreateSkillFromConventionsModal
        repoName="acme/payments-api"
        conventionIds={["c1"]}
        onClose={onClose}
        onCreated={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  it("Create skill submits the edited form fields plus the convention ids", async () => {
    draftMutateAsync.mockResolvedValueOnce(DRAFT);
    createMutateAsync.mockResolvedValueOnce({ id: "sk1", version: 1 });
    renderWithIntl(
      <CreateSkillFromConventionsModal
        repoName="acme/payments-api"
        conventionIds={["c1", "c2"]}
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />,
    );

    const nameInput = await screen.findByDisplayValue(DRAFT.name);
    fireEvent.change(nameInput, { target: { value: "Payments conventions" } });
    fireEvent.click(screen.getByText("Create skill"));

    await screen.findByText("Saved as v1 · added to Skills Lab");
    expect(createMutateAsync).toHaveBeenCalledWith({
      convention_ids: ["c1", "c2"],
      name: "Payments conventions",
      description: DRAFT.description,
      type: DRAFT.type,
      body: DRAFT.body,
    });
  });

  it("shows a saved confirmation banner after a successful create", async () => {
    draftMutateAsync.mockResolvedValueOnce(DRAFT);
    createMutateAsync.mockResolvedValueOnce({ id: "sk1", version: 1 });
    renderWithIntl(
      <CreateSkillFromConventionsModal
        repoName="acme/payments-api"
        conventionIds={["c1"]}
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />,
    );
    await screen.findByDisplayValue(DRAFT.name);
    fireEvent.click(screen.getByText("Create skill"));
    expect(await screen.findByText("Saved as v1 · added to Skills Lab")).toBeInTheDocument();
  });

  it("shows the loading skeleton and no form fields while the draft is still resolving", () => {
    draftMutateAsync.mockReturnValueOnce(new Promise(() => {})); // never resolves
    renderWithIntl(
      <CreateSkillFromConventionsModal
        repoName="acme/payments-api"
        conventionIds={["c1"]}
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />,
    );
    expect(screen.getByText("Merging conventions…")).toBeInTheDocument();
    expect(screen.queryByDisplayValue(DRAFT.name)).not.toBeInTheDocument();
  });

  it("shows an error message and keeps Create skill disabled when the draft fetch fails", async () => {
    draftMutateAsync.mockRejectedValueOnce(new Error("boom"));
    renderWithIntl(
      <CreateSkillFromConventionsModal
        repoName="acme/payments-api"
        conventionIds={["c1"]}
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />,
    );
    expect(await screen.findByText("Could not build a draft from the selected conventions.")).toBeInTheDocument();
    expect(screen.getByText("Create skill")).toBeDisabled();
  });
});
