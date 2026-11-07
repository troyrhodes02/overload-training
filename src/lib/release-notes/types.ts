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
  /**
   * Who an entry is written for, so one catalog serves two surfaces without a
   * second editorial path:
   *   - "internal": a pre-launch development milestone. In-app What's New shows
   *     it (test accounts see the full history); the public changelog does not.
   *   - "public": a public product release. It appears on the public changelog
   *     AND in in-app What's New, from this one source.
   * Overload has not launched publicly yet, so every existing entry is
   * "internal". The first "public" entry is the consolidated launch note,
   * dated the real launch day. `audience` never affects seen state or the
   * What's New dialog (that is `significant`).
   */
  readonly audience: "internal" | "public";
};

/** What every surface renders for an entry: nothing about significance or the reader. */
export type ReleaseNoteView = Pick<
  ReleaseNoteEntry,
  "id" | "date" | "title" | "body"
>;
