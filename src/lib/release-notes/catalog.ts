import { parseIsoDate } from "@/lib/plan/calendar";
import { RELEASE_NOTES } from "./entries";
import type { ReleaseNoteEntry, ReleaseNoteView } from "./types";

/**
 * The release-notes catalog (What's New spec §8, §11; R5–R7, R11, R12, R25).
 * Pure and isomorphic: no server-only module, database, auth, or account code
 * is imported here, so the in-app surfaces and a future public changelog read
 * the same validated list (R21). Per-account seen state lives only in
 * seen.ts.
 *
 * The list is newest first and that order is canonical: index 0 is the newest
 * entry, and "newer" always means "a lower index", never a parsed id. The
 * id's date prefix must equal the entry's date (a permanent id can't carry a
 * wrong one), but ordering still never reads it. Calendar-date validity comes
 * from src/lib/plan/calendar.ts, the app's one home for date semantics (also
 * pure).
 */

export type { ReleaseNoteEntry, ReleaseNoteView } from "./types";

/** A catalog that breaks the content contract; lists every problem found. */
export class ReleaseNotesError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Invalid release notes:\n- ${problems.join("\n- ")}`);
    this.name = "ReleaseNotesError";
  }
}

export const RELEASE_NOTE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const RELEASE_NOTE_ID_MAX = 64;
export const RELEASE_NOTE_TITLE_MAX = 80;
export const RELEASE_NOTE_BODY_MAX = 400;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** True iff `date` is a real calendar date written YYYY-MM-DD. */
export function isReleaseDate(date: unknown): date is string {
  return (
    typeof date === "string" &&
    DATE_PATTERN.test(date) &&
    parseIsoDate(date) !== null
  );
}

/**
 * Checks every rule of the content contract and throws one ReleaseNotesError
 * naming each problem; returns the list unchanged when it is valid.
 */
export function validateReleaseNotes(
  entries: readonly ReleaseNoteEntry[],
): readonly ReleaseNoteEntry[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  entries.forEach((entry, i) => {
    if (typeof entry !== "object" || entry === null) {
      problems.push(`entry ${i}: must be an entry object`);
      return;
    }
    const where = `entry ${i} (${typeof entry.id === "string" ? entry.id : "no id"})`;
    if (
      typeof entry.id !== "string" ||
      !RELEASE_NOTE_ID_PATTERN.test(entry.id) ||
      entry.id.length > RELEASE_NOTE_ID_MAX
    ) {
      problems.push(
        `${where}: id must be a kebab-case slug of at most ${RELEASE_NOTE_ID_MAX} characters`,
      );
    } else if (seen.has(entry.id)) {
      problems.push(`${where}: id is used more than once`);
    } else {
      seen.add(entry.id);
    }
    if (!isReleaseDate(entry.date)) {
      problems.push(`${where}: date must be a real date written YYYY-MM-DD`);
    } else {
      if (
        typeof entry.id === "string" &&
        !entry.id.startsWith(`${entry.date}-`)
      ) {
        problems.push(
          `${where}: id must start with its date (${entry.date}-short-name)`,
        );
      }
      const above = i > 0 ? entries[i - 1] : null;
      if (above && isReleaseDate(above?.date) && entry.date > above.date) {
        problems.push(
          `${where}: dated after the entry above it — the list is newest first`,
        );
      }
    }
    const title = typeof entry.title === "string" ? entry.title.trim() : "";
    if (
      title.length < 1 ||
      title.length > RELEASE_NOTE_TITLE_MAX ||
      /[\r\n]/.test(title)
    ) {
      problems.push(
        `${where}: title must be 1-${RELEASE_NOTE_TITLE_MAX} characters on one line`,
      );
    }
    const body = typeof entry.body === "string" ? entry.body.trim() : "";
    if (body.length < 1 || body.length > RELEASE_NOTE_BODY_MAX) {
      problems.push(
        `${where}: body must be 1-${RELEASE_NOTE_BODY_MAX} characters`,
      );
    } else if (/[<>]|\]\(/.test(body)) {
      problems.push(`${where}: body must be plain text (no HTML or links)`);
    }
    if (typeof entry.significant !== "boolean") {
      problems.push(`${where}: significant must be true or false`);
    }
  });
  if (problems.length > 0) throw new ReleaseNotesError(problems);
  return entries;
}

let validatedFile: readonly ReleaseNoteEntry[] | undefined;

/**
 * The validated catalog, newest first (the file order). With no argument it
 * is the repository's RELEASE_NOTES, validated once; tests and future callers
 * may pass their own list. Throws ReleaseNotesError when invalid.
 */
export function orderedReleaseNotes(
  entries?: readonly ReleaseNoteEntry[],
): readonly ReleaseNoteEntry[] {
  if (entries) return validateReleaseNotes(entries);
  validatedFile ??= validateReleaseNotes(RELEASE_NOTES);
  return validatedFile;
}

/** "2026-11-03" → "Nov 3, 2026". String math only: no Date, locale, or timezone. */
export function formatReleaseDate(date: string): string {
  const m = DATE_PATTERN.exec(date);
  if (!m) return date;
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

/** The public projection every surface renders. */
export function toReleaseNoteView(entry: ReleaseNoteEntry): ReleaseNoteView {
  return {
    id: entry.id,
    date: entry.date,
    title: entry.title,
    body: entry.body,
  };
}

/** True iff `a` is strictly newer than `b` in the catalog. Unknown ids → false. */
export function isNewer(
  catalog: readonly ReleaseNoteEntry[],
  a: string,
  b: string,
): boolean {
  const ia = catalog.findIndex((e) => e.id === a);
  const ib = catalog.findIndex((e) => e.id === b);
  return ia !== -1 && ib !== -1 && ia < ib;
}

/**
 * The account's unseen significant entries, newest first (spec §11; R11,
 * R12). `seenId` is its ReleaseSeen row's entry id (null: no row, shown
 * nothing); `seenOn` is the calendar date, in the account's own timezone, of
 * that row's lastSeenAt; `floor` is the calendar date, in the account's
 * timezone, it was created — an entry dated before it is never unseen.
 */
export function unseenSignificant(
  catalog: readonly ReleaseNoteEntry[],
  state: { seenId: string | null; seenOn: string | null; floor: string },
): readonly ReleaseNoteEntry[] {
  const seenIndex =
    state.seenId === null
      ? -1
      : catalog.findIndex((e) => e.id === state.seenId);
  // A seen id the catalog no longer has (content rule 6 broken): fall back on
  // the date the account was last shown something. Strictly after it: in a
  // broken-contract fallback, never repeating an entry wins over catching one
  // published later that same day (review finding r4331392867, skipped).
  const seenDate =
    state.seenId !== null && seenIndex === -1 ? state.seenOn : null;
  return catalog.filter((entry, i) => {
    if (!entry.significant || entry.date < state.floor) return false;
    if (state.seenId === null) return true;
    if (seenIndex !== -1) return i < seenIndex;
    return seenDate !== null && entry.date > seenDate;
  });
}
