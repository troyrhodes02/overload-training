import { randomUUID } from "node:crypto";
import { establishProfile, type Account } from "@/lib/data/account";
import { accountFor } from "@/lib/data/operator";
import { DomainError } from "@/lib/actions/result";
import * as seenModule from "@/lib/release-notes/seen";
import {
  getWhatsNewDialog,
  initialReleaseSeen,
  markReleaseNotesSeen,
} from "@/lib/release-notes/seen";
import { APP_TABLES, getTestPrisma } from "./support/db";
import { createTestAccount } from "./support/accounts";
import {
  RELEASE_NOTES_FIXTURE as FIXTURE,
  WITH_NEWER,
} from "./support/release-notes";

/**
 * What's New — per-account seen state (spec §6, §11, §14.2; R9–R14, R23).
 * A significant entry the account hasn't seen opens the dialog once; several
 * come together; the seen point only moves forward; a new account starts
 * caught up; and nothing here touches training data.
 *
 * The repository's catalog is empty at launch (R8), so the entries module is
 * mocked with the fixture for the default (no-argument) paths, and newer
 * catalogs are passed explicitly — the mechanism never changes between them.
 */
jest.mock("@/lib/release-notes/entries", () => ({
  RELEASE_NOTES: jest.requireActual("./support/release-notes")
    .RELEASE_NOTES_FIXTURE,
}));

const raw = () => getTestPrisma();
const row = (userId: string) =>
  raw().releaseSeen.findUnique({ where: { userId } });
const ids = (data: { entries: { id: string }[] } | null) =>
  data?.entries.map((e) => e.id) ?? null;

/** A brand-new account, through the real signup profile write. */
async function newAccount(): Promise<Account> {
  const id = randomUUID();
  await establishProfile(
    { id },
    {
      firstName: "Robin",
      lastName: "Lee",
      username: `r_${id.slice(0, 8)}`,
      timeZone: "America/Chicago",
    },
  );
  return accountFor(id);
}

const TRAINING_TABLES = APP_TABLES.filter(
  (t) => !["profiles", "tour_progress", "release_seen"].includes(t),
);
async function trainingRowCount(): Promise<number> {
  let n = 0;
  for (const t of TRAINING_TABLES) {
    const [r] = await raw().$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM "${t}"`,
    );
    n += r.n;
  }
  return n;
}

describe("an account that predates What's New (no row)", () => {
  it("gets every significant entry, newest first, in one dialog; ordinary entries never", async () => {
    const old = await createTestAccount();
    expect(await row(old.userId)).toBeNull();
    const dialog = await getWhatsNewDialog(old);
    expect(ids(dialog)).toEqual([
      "2099-03-01-exercise-history",
      "2099-02-01-faster-logging",
    ]);
    expect(dialog?.throughId).toBe("2099-03-01-exercise-history");
    expect(dialog?.entries[0]).toEqual({
      id: "2099-03-01-exercise-history",
      date: "2099-03-01",
      title: "Exercise history",
      body: FIXTURE[0].body,
    });
    // Reading never writes.
    expect(await row(old.userId)).toBeNull();
  });

  it("is shown once: after the mark, nothing is unseen, and a repeat mark writes nothing", async () => {
    const a = await createTestAccount();
    expect(await markReleaseNotesSeen(a, FIXTURE[0].id)).toEqual({
      moved: true,
    });
    const marked = await row(a.userId);
    expect(marked?.lastSeenReleaseId).toBe(FIXTURE[0].id);
    expect(await getWhatsNewDialog(a)).toBeNull();
    expect(await markReleaseNotesSeen(a, FIXTURE[0].id)).toEqual({
      moved: false,
    });
    expect(await row(a.userId)).toEqual(marked);
  });

  it("a newer significant entry added on top is the only one shown next", async () => {
    const a = await createTestAccount();
    await markReleaseNotesSeen(a, FIXTURE[0].id);
    const next = await getWhatsNewDialog(a, WITH_NEWER);
    expect(ids(next)).toEqual(["2099-04-01-reps-in-reserve"]);
    expect(next?.throughId).toBe("2099-04-01-reps-in-reserve");
    await markReleaseNotesSeen(a, next!.throughId, { catalog: WITH_NEWER });
    expect(await getWhatsNewDialog(a, WITH_NEWER)).toBeNull();
  });

  it("an ordinary entry alone never opens the dialog", async () => {
    const a = await createTestAccount();
    const onlyOrdinary = [FIXTURE[1]];
    expect(await getWhatsNewDialog(a, onlyOrdinary)).toBeNull();
  });
});

describe("the seen point only moves forward (R14)", () => {
  it("an older mark after a newer one changes nothing", async () => {
    const a = await createTestAccount();
    await markReleaseNotesSeen(a, FIXTURE[0].id);
    const before = await row(a.userId);
    expect(await markReleaseNotesSeen(a, FIXTURE[2].id)).toEqual({
      moved: false,
    });
    expect(await row(a.userId)).toEqual(before);
  });

  it("an older mark first, then the newer one, ends at the newer one", async () => {
    const a = await createTestAccount();
    await markReleaseNotesSeen(a, FIXTURE[2].id);
    expect(ids(await getWhatsNewDialog(a))).toEqual([FIXTURE[0].id]);
    expect(await markReleaseNotesSeen(a, FIXTURE[0].id)).toEqual({
      moved: true,
    });
    expect((await row(a.userId))?.lastSeenReleaseId).toBe(FIXTURE[0].id);
  });

  it("concurrent marks end at the newest", async () => {
    const a = await createTestAccount();
    await Promise.all([
      markReleaseNotesSeen(a, FIXTURE[2].id),
      markReleaseNotesSeen(a, FIXTURE[0].id),
    ]);
    expect((await row(a.userId))?.lastSeenReleaseId).toBe(FIXTURE[0].id);
  });

  it("a stored id the catalog no longer has is replaced by the next mark", async () => {
    const a = await createTestAccount();
    await raw().releaseSeen.create({
      data: {
        userId: a.userId,
        lastSeenReleaseId: "2099-01-01-removed-entry",
        lastSeenAt: new Date("2099-02-10T12:00:00Z"),
      },
    });
    // Unknown id: entries dated after the row's lastSeenAt date are unseen.
    expect(ids(await getWhatsNewDialog(a))).toEqual([FIXTURE[0].id]);
    expect(await markReleaseNotesSeen(a, FIXTURE[0].id)).toEqual({
      moved: true,
    });
    expect(await getWhatsNewDialog(a)).toBeNull();
  });
});

describe("validation", () => {
  it.each([["no-such-entry"], [""], [42], [null], [{ id: FIXTURE[0].id }]])(
    "rejects %p as an unknown update and writes nothing",
    async (bad) => {
      const a = await createTestAccount();
      await expect(markReleaseNotesSeen(a, bad)).rejects.toEqual(
        new DomainError("validation_error", "Unknown update."),
      );
      expect(await row(a.userId)).toBeNull();
    },
  );

  it("an invalid catalog means no dialog (logged), never a crash", async () => {
    const a = await createTestAccount();
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const broken = [FIXTURE[2], FIXTURE[0]]; // dated after the entry above it
    expect(await getWhatsNewDialog(a, broken)).toBeNull();
    expect(spy).toHaveBeenCalledWith(
      "release notes: invalid catalog",
      "ReleaseNotesError",
    );
    spy.mockRestore();
  });

  it("an empty catalog: no dialog and nothing to mark", async () => {
    const a = await createTestAccount();
    expect(await getWhatsNewDialog(a, [])).toBeNull();
    await expect(
      markReleaseNotesSeen(a, FIXTURE[0].id, { catalog: [] }),
    ).rejects.toBeInstanceOf(DomainError);
  });
});

describe("a new account starts caught up (AC-3, R10)", () => {
  it("signup writes its row at the newest entry, so its first load has no dialog", async () => {
    const a = await newAccount();
    expect(await row(a.userId)).toEqual(
      expect.objectContaining({
        lastSeenReleaseId: FIXTURE[0].id,
        lastSeenAt: expect.any(Date),
      }),
    );
    expect(await getWhatsNewDialog(a)).toBeNull();
    // Later entries are shown normally.
    expect(ids(await getWhatsNewDialog(a, WITH_NEWER))).toEqual([
      "2099-04-01-reps-in-reserve",
    ]);
  });

  it("a repeated signup profile write keeps one row; no entries means no starting point", async () => {
    const id = randomUUID();
    const input = {
      firstName: "Robin",
      lastName: "Lee",
      username: `r_${id.slice(0, 8)}`,
      timeZone: "UTC",
    };
    await establishProfile({ id }, input);
    await establishProfile({ id }, input);
    expect(await raw().releaseSeen.count({ where: { userId: id } })).toBe(1);
    expect(initialReleaseSeen([])).toBeNull();
    expect(initialReleaseSeen(FIXTURE)).toEqual({
      lastSeenReleaseId: FIXTURE[0].id,
      lastSeenAt: expect.any(Date),
    });
  });

  it("without its row, the account floor still hides entries from before it existed (R12)", async () => {
    const late = await createTestAccount();
    // Created on 2099-02-20: after faster-logging (02-01), before history (03-01).
    await raw().profile.update({
      where: { userId: late.userId },
      data: { createdAt: new Date("2099-02-20T08:00:00Z") },
    });
    expect(await row(late.userId)).toBeNull();
    expect(ids(await getWhatsNewDialog(late))).toEqual([FIXTURE[0].id]);
  });

  it("a failed release-notes start never fails signup", async () => {
    const spy = jest
      .spyOn(seenModule, "initialReleaseSeen")
      .mockImplementationOnce(() => {
        throw new Error("boom");
      });
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      const a = await newAccount();
      expect(spy).toHaveBeenCalledTimes(1);
      expect(
        await raw().profile.findUnique({ where: { userId: a.userId } }),
      ).not.toBeNull();
      expect(await row(a.userId)).toBeNull();
      expect(log).toHaveBeenCalledWith(
        "signup: could not start the new account's release notes",
        "Error",
      );
    } finally {
      spy.mockRestore();
      log.mockRestore();
    }
  });
});

it("nothing in What's New touches training data", async () => {
  const a = await newAccount();
  const old = await createTestAccount();
  const before = await trainingRowCount();
  await getWhatsNewDialog(old);
  await markReleaseNotesSeen(old, FIXTURE[2].id);
  await markReleaseNotesSeen(old, FIXTURE[0].id);
  await getWhatsNewDialog(a, WITH_NEWER);
  await markReleaseNotesSeen(a, WITH_NEWER[0].id, { catalog: WITH_NEWER });
  expect(await trainingRowCount()).toBe(before);
});
