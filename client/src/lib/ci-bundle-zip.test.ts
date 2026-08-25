import { describe, it, expect } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { ciFilesToZipBlob } from "./ci-bundle-zip";
import type { CiFile } from "@devdigest/shared";

/** jsdom's `Blob` shim has no `arrayBuffer()` (unlike Node's or a browser's) —
 *  read it back the way it does support, via `FileReader`. */
function readBlobAsUint8Array(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

describe("ciFilesToZipBlob", () => {
  it("zips every file path with its raw contents, leaving script-like text inert", async () => {
    const files: CiFile[] = [
      { path: ".github/workflows/devdigest.yml", contents: "on: pull_request\n", editable: true },
      {
        path: ".devdigest/skills/example.md",
        contents: "<script>alert(1)</script>",
        editable: true,
      },
    ];

    const blob = ciFilesToZipBlob(files);
    expect(blob.type).toBe("application/zip");

    const buffer = await readBlobAsUint8Array(blob);
    const unzipped = unzipSync(buffer);

    expect(Object.keys(unzipped).sort()).toEqual(
      [".devdigest/skills/example.md", ".github/workflows/devdigest.yml"].sort(),
    );
    expect(strFromU8(unzipped[".github/workflows/devdigest.yml"]!)).toBe("on: pull_request\n");
    expect(strFromU8(unzipped[".devdigest/skills/example.md"]!)).toBe(
      "<script>alert(1)</script>",
    );
  });
});
