import { Share } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import {
  exportFilename,
  isAccountExport,
  serializeAccountExport,
} from "@overload/shared/accounts/export-file";

/**
 * The export file on the phone (Pitch 21j design §6 A8; RD-8, RD-12, RD-13).
 * The server's document is checked complete, written as the web's exact file
 * (`overload-export-YYYY-MM-DD.json`, two-space JSON) under the app's cache
 * in `exports/`, handed to the iOS share sheet, and deleted when the sheet
 * closes. The folder is emptied at launch and before each export, so an
 * interrupted export never lingers. Nothing here uploads anything.
 */

export type ExportOutcome = "shared" | "dismissed";

export class ExportNotComplete extends Error {
  constructor() {
    super("The export answer wasn't a complete export.");
    this.name = "ExportNotComplete";
  }
}

export class ExportWriteFailed extends Error {
  constructor() {
    super("The export file couldn't be written.");
    this.name = "ExportWriteFailed";
  }
}

const exportsDir = () => new Directory(Paths.cache, "exports");

/** Empty the exports folder. Best effort: never throws. */
export function clearExportFiles(): void {
  try {
    const dir = exportsDir();
    if (dir.exists) dir.delete();
  } catch {
    // A leftover file in the app's own cache is removed next time.
  }
}

/** Write the document as the web's file; the caller deletes it. */
export async function writeExportFile(doc: unknown): Promise<File> {
  if (!isAccountExport(doc)) throw new ExportNotComplete();
  clearExportFiles();
  try {
    const dir = exportsDir();
    dir.create({ intermediates: true, idempotent: true });
    const file = new File(dir, exportFilename(doc.exportedOn));
    file.create({ overwrite: true });
    await file.write(serializeAccountExport(doc));
    return file;
  } catch {
    clearExportFiles();
    throw new ExportWriteFailed();
  }
}

/**
 * Write, share, and always delete. A dismissed sheet is not an error. The
 * file is gone by the time this returns, whatever happened.
 */
export async function shareExport(
  doc: unknown,
  deps: { share?: typeof Share.share } = {},
): Promise<ExportOutcome> {
  const file = await writeExportFile(doc);
  try {
    const result = await (deps.share ?? Share.share)({ url: file.uri });
    return result.action === Share.sharedAction ? "shared" : "dismissed";
  } finally {
    clearExportFiles();
  }
}
