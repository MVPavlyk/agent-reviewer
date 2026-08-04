import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/skills.json";
import { ApiError } from "@/lib/api";

const createMutateAsync = vi.fn();
vi.mock("@/lib/hooks/skills", () => ({
  useCreateSkill: () => ({ mutateAsync: createMutateAsync, isPending: false }),
  useImportSkillPreview: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false }),
}));

import { AddSkillDrawer } from "./AddSkillDrawer";

afterEach(() => {
  cleanup();
  createMutateAsync.mockReset();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

/** "Create skill" is client-disabled while name is blank, but nothing stops
 *  an empty body — that's exactly the gap a server 422 on /body covers. */
function fillNameAndSubmit() {
  const inputs = screen.getAllByRole("textbox");
  fireEvent.change(inputs[0]!, { target: { value: "API Contract Rubric" } });
  fireEvent.click(screen.getByText("Create skill"));
}

describe("AddSkillDrawer — field-level validation errors (smoke)", () => {
  it("shows the server's field message under the failing input on a 422", async () => {
    createMutateAsync.mockRejectedValueOnce(
      new ApiError("Request validation failed", 422, "validation_error", [
        { instancePath: "/body", message: "String must contain at least 1 character(s)" },
      ]),
    );
    renderWithIntl(<AddSkillDrawer onClose={() => {}} onCreated={() => {}} />);

    fillNameAndSubmit();

    expect(await screen.findByText("String must contain at least 1 character(s)")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("String must contain at least 1 character(s)");
  });

  it("does not close the drawer or call onCreated when the create fails", async () => {
    createMutateAsync.mockRejectedValueOnce(
      new ApiError("Request validation failed", 422, "validation_error", [
        { instancePath: "/body", message: "Required" },
      ]),
    );
    const onClose = vi.fn();
    const onCreated = vi.fn();
    renderWithIntl(<AddSkillDrawer onClose={onClose} onCreated={onCreated} />);

    fillNameAndSubmit();
    await screen.findByText("Required");

    expect(onClose).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("clears the field error once the user edits that field again", async () => {
    createMutateAsync.mockRejectedValueOnce(
      new ApiError("Request validation failed", 422, "validation_error", [
        { instancePath: "/body", message: "String must contain at least 1 character(s)" },
      ]),
    );
    renderWithIntl(<AddSkillDrawer onClose={() => {}} onCreated={() => {}} />);

    fillNameAndSubmit();
    expect(await screen.findByText("String must contain at least 1 character(s)")).toBeInTheDocument();

    const textarea = document.querySelector("textarea")!;
    fireEvent.change(textarea, { target: { value: "Check every changed handler." } });

    expect(screen.queryByText("String must contain at least 1 character(s)")).not.toBeInTheDocument();
  });
});
