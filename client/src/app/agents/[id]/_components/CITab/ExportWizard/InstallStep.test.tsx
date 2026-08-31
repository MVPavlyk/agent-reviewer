import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/ci.json";

import { InstallStep } from "./InstallStep";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ ci: messages }}>{ui}</NextIntlClientProvider>);
}

describe("InstallStep (SPEC-06 AC-22/23/24/25/26, EC-4/8; ADDENDUM v2 decision 1)", () => {
  it("both cards are functional — Install works for zip and for the real 'Open a PR' path (AC-22/23/24)", () => {
    const onChangeInstallOption = vi.fn();
    const onInstall = vi.fn();
    const onBack = vi.fn();
    const { rerender } = renderWithIntl(
      <InstallStep
        repo="acme/repo"
        fileCount={2}
        installOption="files"
        onChangeInstallOption={onChangeInstallOption}
        onBack={onBack}
        onInstall={onInstall}
        isPending={false}
        isError={false}
        result={null}
        onDone={vi.fn()}
      />,
    );

    const openPrCard = screen.getByRole("button", { name: /open a pr with these files/i });
    expect(openPrCard).not.toHaveAttribute("aria-disabled");

    expect(screen.getByRole("button", { name: /^install$/i })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: /^install$/i }));
    expect(onInstall).toHaveBeenCalledTimes(1);

    // Selecting "Open a PR" is reported upward and Install stays enabled —
    // it is a real path now, not a disabled stub.
    fireEvent.click(openPrCard);
    expect(onChangeInstallOption).toHaveBeenCalledWith("open_pr");
    rerender(
      <NextIntlClientProvider locale="en" messages={{ ci: messages }}>
        <InstallStep
          repo="acme/repo"
          fileCount={2}
          installOption="open_pr"
          onChangeInstallOption={onChangeInstallOption}
          onBack={onBack}
          onInstall={onInstall}
          isPending={false}
          isError={false}
          result={null}
          onDone={vi.fn()}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("button", { name: /^install$/i })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: /^install$/i }));
    expect(onInstall).toHaveBeenCalledTimes(2);
  });

  it("isPending disables Install (AC-25); isError shows an error state with Retry, without implying success (AC-26/EC-8)", () => {
    const onInstall = vi.fn();
    const { rerender } = renderWithIntl(
      <InstallStep
        repo="acme/repo"
        fileCount={2}
        installOption="files"
        onChangeInstallOption={vi.fn()}
        onBack={vi.fn()}
        onInstall={onInstall}
        isPending
        isError={false}
        result={null}
        onDone={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /installing/i })).toBeDisabled();

    rerender(
      <NextIntlClientProvider locale="en" messages={{ ci: messages }}>
        <InstallStep
          repo="acme/repo"
          fileCount={2}
          installOption="files"
          onChangeInstallOption={vi.fn()}
          onBack={vi.fn()}
          onInstall={onInstall}
          isPending={false}
          isError
          result={null}
          onDone={vi.fn()}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/export failed/i);
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onInstall).toHaveBeenCalledTimes(1);
  });

  it("a successful 'Open a PR' install shows the PR link and the once-only ingest token; Done closes the wizard", () => {
    const onDone = vi.fn();
    renderWithIntl(
      <InstallStep
        repo="acme/repo"
        fileCount={2}
        installOption="open_pr"
        onChangeInstallOption={vi.fn()}
        onBack={vi.fn()}
        onInstall={vi.fn()}
        isPending={false}
        isError={false}
        result={{ prUrl: "https://github.com/acme/repo/pull/1", ingestToken: "tok_abc123" }}
        onDone={onDone}
      />,
    );

    expect(screen.getByRole("link", { name: /view pull request/i })).toHaveAttribute(
      "href",
      "https://github.com/acme/repo/pull/1",
    );
    expect(screen.getByText("tok_abc123")).toBeInTheDocument();
    expect(screen.getByText(/won't be shown again/i)).toBeInTheDocument();

    // Checklist of what the target repo still needs (OPENROUTER_API_KEY is
    // the #1 cause of a first-run 401 — surfaced right where the user is
    // about to go set up the repo).
    expect(screen.getByText(/required in the target repo/i)).toBeInTheDocument();
    expect(screen.getByText(/OPENROUTER_API_KEY/)).toBeInTheDocument();
    expect(screen.getByText(/DEVDIGEST_INGEST_TOKEN secret above/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /done/i }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("checklist omits the ingest-token line when no token was minted (e.g. preview-only)", () => {
    renderWithIntl(
      <InstallStep
        repo="acme/repo"
        fileCount={2}
        installOption="files"
        onChangeInstallOption={vi.fn()}
        onBack={vi.fn()}
        onInstall={vi.fn()}
        isPending={false}
        isError={false}
        result={{ prUrl: null, ingestToken: null }}
        onDone={vi.fn()}
      />,
    );
    expect(screen.getByText(/OPENROUTER_API_KEY/)).toBeInTheDocument();
    expect(screen.queryByText(/DEVDIGEST_INGEST_TOKEN secret above/i)).not.toBeInTheDocument();
  });

  it("a successful zip install shows the files-downloaded confirmation without a PR link", () => {
    renderWithIntl(
      <InstallStep
        repo="acme/repo"
        fileCount={2}
        installOption="files"
        onChangeInstallOption={vi.fn()}
        onBack={vi.fn()}
        onInstall={vi.fn()}
        isPending={false}
        isError={false}
        result={{ prUrl: null, ingestToken: "tok_zip" }}
        onDone={vi.fn()}
      />,
    );

    expect(screen.getByText(/files downloaded/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /view pull request/i })).not.toBeInTheDocument();
    expect(screen.getByText("tok_zip")).toBeInTheDocument();
  });
});
