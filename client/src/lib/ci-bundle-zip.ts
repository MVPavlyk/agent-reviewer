/* ci-bundle-zip.ts — turn a server-generated CI export bundle (`CiExport.files`)
   into a downloadable zip Blob. Pure data transform, no network, no parsing or
   evaluation of `contents` (NFR-2) — every file's raw bytes go into the
   archive as-is, including `<script>`-looking text, which stays inert data
   inside the zip entry. */
import { strToU8, zipSync } from "fflate";
import type { CiFile } from "@devdigest/shared";

/** Build a zip `Blob` from a CI export bundle, one entry per `CiFile.path`. */
export function ciFilesToZipBlob(files: CiFile[]): Blob {
  const entries: Record<string, Uint8Array> = {};
  for (const file of files) {
    entries[file.path] = strToU8(file.contents);
  }
  const zipped = zipSync(entries);
  return new Blob([zipped], { type: "application/zip" });
}
