import "server-only";
import { cache } from "react";
import { DomainError } from "@/lib/actions/result";
import type { Account } from "@/lib/data/account";
import type { AccountTx } from "@/lib/data/account-db";
import {
  isNewer,
  orderedReleaseNotes,
  toReleaseNoteView,
  unseenSignificant,
  utcDate,
  type ReleaseNoteEntry,
  type ReleaseNoteView,
} from "./catalog";

/**
 * The acting account's What's New state (What's New spec §11; R9–R14). One
 * ReleaseSeen row per account holds the newest entry it has been shown (or
 * started at, at signup). The seen point only moves forward. Reached only
 * through the account-scoped client, so one account can never read, change,
 * or detect another's. This module is server-only and is the one place seen
 * state lives: the content modules (catalog.ts, entries.ts) never import it.
 */

/** What the shell's dialog needs: the unseen significant entries + the mark. */
export type WhatsNewDialogData = {
  /** At least one, newest first, significant only. */
  entries: ReleaseNoteView[];
  /** The catalog's newest entry id when the page rendered (R13). */
  throughId: string;
};

/**
 * The acting account's dialog content, or null when nothing significant is
 * unseen. Memoized per request (React cache): the (app) layout reads it once
 * per render. A catalog that fails validation is logged and means "no
 * dialog": a bad entry must never take every signed-in page down (R23).
 */
export const getWhatsNewDialog = cache(async function getWhatsNewDialog(
  account: Account,
  catalogOverride?: readonly ReleaseNoteEntry[],
): Promise<WhatsNewDialogData | null> {
  let catalog: readonly ReleaseNoteEntry[];
  try {
    catalog = orderedReleaseNotes(catalogOverride);
  } catch (error) {
    console.error(
      "release notes: invalid catalog",
      error instanceof Error ? error.name : "unknown",
    );
    return null;
  }
  if (catalog.length === 0) return null;
  const [row, profile] = await Promise.all([
    account.db.releaseSeen.findUnique({
      where: { userId: account.userId },
      select: { lastSeenReleaseId: true, lastSeenAt: true },
    }),
    account.db.profile.findUnique({
      where: { userId: account.userId },
      select: { createdAt: true },
    }),
  ]);
  const unseen = unseenSignificant(catalog, {
    seenId: row?.lastSeenReleaseId ?? null,
    seenAt: row?.lastSeenAt ?? null,
    // The account floor (R12): nothing dated before the account existed.
    floor: profile ? utcDate(profile.createdAt) : "9999-12-31",
  });
  if (unseen.length === 0) return null;
  return { entries: unseen.map(toReleaseNoteView), throughId: catalog[0].id };
});

/**
 * Moves the acting account's seen point forward to `throughId`, a catalog
 * entry id (anything else is a validation_error). Never moves it back: an id
 * that is not newer than the stored one is a no-op (R14). No row → create;
 * otherwise compare-and-set on the value read, re-read once if another write
 * won in between. No raw SQL and no lock: within an account this is a
 * single-writer system, and the worst case of a lost race is one repeat.
 */
export async function markReleaseNotesSeen(
  account: Account,
  throughId: unknown,
  opts: { catalog?: readonly ReleaseNoteEntry[]; tx?: AccountTx } = {},
): Promise<{ moved: boolean }> {
  const catalog = orderedReleaseNotes(opts.catalog);
  if (
    typeof throughId !== "string" ||
    !catalog.some((e) => e.id === throughId)
  ) {
    throw new DomainError("validation_error", "Unknown update.");
  }
  if (!opts.tx) {
    return account.db.$transaction((tx) =>
      markReleaseNotesSeen(account, throughId, { ...opts, tx }),
    );
  }
  const tx = opts.tx;
  const data = { lastSeenReleaseId: throughId, lastSeenAt: new Date() };

  for (let attempt = 0; attempt < 2; attempt++) {
    const row = await tx.releaseSeen.findUnique({
      where: { userId: account.userId },
      select: { lastSeenReleaseId: true },
    });
    if (!row) {
      const { count } = await tx.releaseSeen.createMany({
        data: [{ userId: account.userId, ...data }],
        skipDuplicates: true,
      });
      if (count === 1) return { moved: true };
      continue; // a concurrent create won: apply the update rule to it
    }
    const current = row.lastSeenReleaseId;
    const known = catalog.some((e) => e.id === current);
    // Forward only: a known current id at or above throughId stays put. An
    // unknown current id (content rule 6 broken) is replaced.
    if (known && !isNewer(catalog, throughId, current)) {
      return { moved: false };
    }
    const { count } = await tx.releaseSeen.updateMany({
      where: { userId: account.userId, lastSeenReleaseId: current },
      data,
    });
    if (count === 1) return { moved: true };
    // Another mark moved it since the read: re-read and decide again.
  }
  return { moved: false };
}

/**
 * Where a brand-new account's seen point starts: the newest entry, already
 * seen (guide D2; R10), or null when there are no entries yet (no row; the
 * account floor covers what ships later). The signup profile write in the
 * data layer stores it. Throws ReleaseNotesError on an invalid catalog.
 */
export function initialReleaseSeen(
  catalogOverride?: readonly ReleaseNoteEntry[],
): { lastSeenReleaseId: string; lastSeenAt: Date } | null {
  const catalog = orderedReleaseNotes(catalogOverride);
  if (catalog.length === 0) return null;
  return { lastSeenReleaseId: catalog[0].id, lastSeenAt: new Date() };
}
