import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/conventions.json";
import { MergedBodyEditor } from "./MergedBodyEditor";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("MergedBodyEditor (smoke)", () => {
  it("shows the filename tab and a token estimate matching ceil(len/4)", () => {
    renderWithIntl(
      <MergedBodyEditor filename="acme-conventions.md" value={"x".repeat(40)} onChange={vi.fn()} />,
    );
    expect(screen.getByText("acme-conventions.md")).toBeInTheDocument();
    expect(screen.getByText("~10 tokens")).toBeInTheDocument();
  });

  it("calls onChange with the edited text", () => {
    const onChange = vi.fn();
    renderWithIntl(<MergedBodyEditor filename="f.md" value="hello" onChange={onChange} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "hello world" } });
    expect(onChange).toHaveBeenCalledWith("hello world");
  });

  it("recomputes the token estimate as the value changes", () => {
    const { rerender } = renderWithIntl(
      <MergedBodyEditor filename="f.md" value={"y".repeat(8)} onChange={vi.fn()} />,
    );
    expect(screen.getByText("~2 tokens")).toBeInTheDocument();
    rerender(
      <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
        <MergedBodyEditor filename="f.md" value={"y".repeat(80)} onChange={vi.fn()} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("~20 tokens")).toBeInTheDocument();
  });
});
