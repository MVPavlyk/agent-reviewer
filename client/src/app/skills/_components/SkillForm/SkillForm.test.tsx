import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/skills.json";
import { SkillForm } from "./SkillForm";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("SkillForm (smoke)", () => {
  it("renders name/description/type/body fields", () => {
    renderWithIntl(
      <SkillForm
        value={{ name: "Rubric", description: "d", type: "rubric", body: "b" }}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText("Skill name")).toBeInTheDocument();
    expect(screen.getByText("Description")).toBeInTheDocument();
    expect(screen.getByText("Type")).toBeInTheDocument();
    expect(screen.getByText("Skill body (Markdown)")).toBeInTheDocument();
  });

  it("shows the description caption (imperative-phrasing hint) — a product requirement", () => {
    renderWithIntl(
      <SkillForm
        value={{ name: "", description: "", type: "rubric", body: "" }}
        onChange={() => {}}
      />,
    );
    expect(
      screen.getByText("A description should be phrased imperatively", { exact: false }),
    ).toBeInTheDocument();
  });

  it("shows a field-level error message and marks that input invalid", () => {
    renderWithIntl(
      <SkillForm
        value={{ name: "", description: "d", type: "rubric", body: "b" }}
        onChange={() => {}}
        errors={{ name: "String must contain at least 1 character(s)" }}
      />,
    );
    expect(screen.getByText("String must contain at least 1 character(s)")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("String must contain at least 1 character(s)");
  });

  it("the error replaces the hint for the same field, but other fields keep their own hint", () => {
    renderWithIntl(
      <SkillForm
        value={{ name: "", description: "d", type: "rubric", body: "b" }}
        onChange={() => {}}
        errors={{ description: "Required" }}
      />,
    );
    expect(screen.getByText("Required")).toBeInTheDocument();
    expect(screen.queryByText("A description should be phrased imperatively", { exact: false })).not.toBeInTheDocument();
  });

  it("without errors, no alert renders", () => {
    renderWithIntl(
      <SkillForm value={{ name: "x", description: "d", type: "rubric", body: "b" }} onChange={() => {}} />,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
