/**
 * One release-note entry (What's New spec §8, "Release-note content
 * contract"). Repository content, never a database row. Public-safe: this
 * module, entries.ts, catalog.ts, and the ReleaseNote component import nothing
 * private, so a future public changelog can reuse them as they are (R21).
 */
export type ReleaseNoteEntry = {
  /** Permanent kebab-case slug, unique, never reused or changed: YYYY-MM-DD-short-name. */
  readonly id: string;
  /** The shipping date (the day it reached production), YYYY-MM-DD. Never planned, never backdated. */
  readonly date: string;
  /** Short, plain title for the lifter. 1-80 characters, one line. */
  readonly title: string;
  /** One to three plain sentences: what changed and why it matters. 1-400 characters, no markup, no links. */
  readonly body: string;
  /** True only if this entry should open the What's New dialog for accounts that haven't seen it. */
  readonly significant: boolean;
};

/** What every surface renders for an entry: nothing about significance or the reader. */
export type ReleaseNoteView = Pick<
  ReleaseNoteEntry,
  "id" | "date" | "title" | "body"
>;
