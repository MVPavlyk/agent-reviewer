import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/skills.json";
import type { ImportSkillPreviewResult } from "@/lib/hooks/skills";
import { ImportPreview } from "./ImportPreview";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const RESULT: ImportSkillPreviewResult = {
  draft: {
    name: "API Contract Rubric",
    description: "Flags handler responses that drift from their declared schema.",
    type: "rubric",
    source: "extracted",
    body: "Check every changed HTTP handler against its schema.",
  },
  ignored_entries: [{ path: "install.sh", reason: "not a recognised text/markdown file" }],
  warnings: [],
};

describe("ImportPreview (smoke)", () => {
  it("shows the extracted name and body via the shared SkillForm", () => {
    renderWithIntl(<ImportPreview result={RESULT} onDraftChange={() => {}} />);
    expect(screen.getByDisplayValue("API Contract Rubric")).toBeInTheDocument();
    expect(screen.getByDisplayValue(/Check every changed HTTP handler/)).toBeInTheDocument();
  });

  it("lists ignored entries (e.g. a decoy install.sh) with their reason", () => {
    renderWithIntl(<ImportPreview result={RESULT} onDraftChange={() => {}} />);
    expect(screen.getByText("Ignored entries (not read)")).toBeInTheDocument();
    expect(screen.getByText("install.sh")).toBeInTheDocument();
    expect(screen.getByText("not a recognised text/markdown file")).toBeInTheDocument();
  });

  it("shows the untrusted-source trust notice", () => {
    renderWithIntl(<ImportPreview result={RESULT} onDraftChange={() => {}} />);
    expect(screen.getByText(/came from an untrusted source/)).toBeInTheDocument();
  });

  it("omits the ignored-entries box when nothing was ignored", () => {
    renderWithIntl(<ImportPreview result={{ ...RESULT, ignored_entries: [] }} onDraftChange={() => {}} />);
    expect(screen.queryByText("Ignored entries (not read)")).not.toBeInTheDocument();
  });

  it("calls onDraftChange with the edited field when the name is changed", () => {
    const onDraftChange = vi.fn();
    renderWithIntl(<ImportPreview result={RESULT} onDraftChange={onDraftChange} />);
    fireEvent.change(screen.getByDisplayValue("API Contract Rubric"), {
      target: { value: "Renamed Rubric" },
    });
    expect(onDraftChange).toHaveBeenCalledWith(expect.objectContaining({ name: "Renamed Rubric" }));
  });
});
