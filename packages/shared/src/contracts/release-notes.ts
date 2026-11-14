/**
 * What's New content. The dialog data is built by apps/web/src/lib/release-
 * notes/seen.ts (moved here in Pitch 21b, so the compiler holds the server's
 * output to the contract). Wire conventions: ./wire.ts.
 */
import type { ReleaseNoteView } from "../release-notes/types";

export type { ReleaseNoteView } from "../release-notes/types";

/** What the shell's dialog needs: the unseen significant entries + the mark. */
export type WhatsNewDialogData = {
  /** At least one, newest first, significant only. */
  entries: ReleaseNoteView[];
  /** The catalog's newest entry id when the page rendered (R13). */
  throughId: string;
};

/** `GET /release-notes`: the full list, newest first. */
export type ReleaseNotesDto = { entries: ReleaseNoteView[] };
