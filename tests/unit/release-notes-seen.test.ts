import { getWhatsNewDialog } from "@/lib/release-notes/seen";
import type { Account } from "@/lib/data/account";
import type { ReleaseNoteEntry } from "@/lib/release-notes/types";

/**
 * What's New seen-state reads that must never take the app down (spec R23;
 * review r4331392722): a failed read means "no dialog", logged by error name
 * only, and an empty catalog reads nothing at all.
 */

const ENTRY: ReleaseNoteEntry = {
  id: "2027-03-01-exercise-history",
  date: "2027-03-01",
  title: "Exercise history",
  body: "Every lift now has its own page.",
  significant: true,
};

function fakeAccount(
  releaseSeen: () => Promise<unknown>,
  profile: () => Promise<unknown> = async () => ({
    createdAt: new Date("2026-10-20T12:00:00Z"),
  }),
): Account {
  return {
    userId: "a0000000-0000-4000-8000-000000000001",
    timeZone: "America/Chicago",
    db: {
      releaseSeen: { findUnique: jest.fn(releaseSeen) },
      profile: { findUnique: jest.fn(profile) },
    },
  } as unknown as Account;
}

it("a failed seen-state read means no dialog, logged without details", async () => {
  const log = jest.spyOn(console, "error").mockImplementation(() => {});
  const missingTable = Object.assign(new Error("relation does not exist"), {
    name: "PrismaClientKnownRequestError",
  });
  const account = fakeAccount(async () => {
    throw missingTable;
  });
  await expect(getWhatsNewDialog(account, [ENTRY])).resolves.toBeNull();
  expect(log).toHaveBeenCalledWith(
    "release notes: could not read seen state",
    "PrismaClientKnownRequestError",
  );
  log.mockRestore();
});

it("a failed profile read means no dialog too", async () => {
  const log = jest.spyOn(console, "error").mockImplementation(() => {});
  const account = fakeAccount(
    async () => null,
    async () => {
      throw new Error("pooler timeout");
    },
  );
  await expect(getWhatsNewDialog(account, [ENTRY])).resolves.toBeNull();
  log.mockRestore();
});

it("an empty catalog reads nothing", async () => {
  const account = fakeAccount(async () => null);
  await expect(getWhatsNewDialog(account, [])).resolves.toBeNull();
  expect(account.db.releaseSeen.findUnique).not.toHaveBeenCalled();
});

it("with no row, every significant entry from the account's own creation date is shown", async () => {
  const account = fakeAccount(async () => null);
  await expect(getWhatsNewDialog(account, [ENTRY])).resolves.toEqual({
    entries: [
      {
        id: ENTRY.id,
        date: ENTRY.date,
        title: ENTRY.title,
        body: ENTRY.body,
      },
    ],
    throughId: ENTRY.id,
  });
});
