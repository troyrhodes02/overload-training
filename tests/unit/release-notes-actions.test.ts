jest.mock("@/lib/data/account", () => ({ requireAccount: jest.fn() }));
jest.mock("@/lib/release-notes/seen", () => ({
  markReleaseNotesSeen: jest.fn(),
}));

import fs from "node:fs";
import path from "node:path";
import { requireAccount } from "@/lib/data/account";
import { DomainError } from "@/lib/actions/result";
import { markReleaseNotesSeen } from "@/lib/release-notes/seen";
import { markReleaseNotesSeenAction } from "@/app/(app)/release-notes-actions";

/**
 * What's New server action (spec §11, §12; R15). The acting account comes
 * from the auth session; the only client input is an entry id.
 */

const account = { userId: "acting-user", timeZone: "UTC", db: {} };

beforeEach(() => {
  jest.clearAllMocks();
  (requireAccount as jest.Mock).mockResolvedValue(account);
  (markReleaseNotesSeen as jest.Mock).mockResolvedValue({ moved: true });
});

it("resolves the account from the auth session first, then marks for it", async () => {
  expect(await markReleaseNotesSeenAction("2026-11-03-faster")).toEqual({
    ok: true,
    data: { moved: true },
  });
  expect(requireAccount).toHaveBeenCalledTimes(1);
  expect(markReleaseNotesSeen).toHaveBeenCalledWith(
    account,
    "2026-11-03-faster",
  );
});

it("an unknown entry is a validation_error with the module's message", async () => {
  (markReleaseNotesSeen as jest.Mock).mockRejectedValueOnce(
    new DomainError("validation_error", "Unknown update."),
  );
  expect(await markReleaseNotesSeenAction("nope")).toEqual({
    ok: false,
    error: { code: "validation_error", message: "Unknown update." },
  });
});

it("anything else is a generic internal_error", async () => {
  const log = jest.spyOn(console, "error").mockImplementation(() => {});
  (markReleaseNotesSeen as jest.Mock).mockRejectedValueOnce(
    new Error("db down"),
  );
  expect(await markReleaseNotesSeenAction("2026-11-03-faster")).toEqual({
    ok: false,
    error: {
      code: "internal_error",
      message: "Couldn't save that you've seen this update.",
    },
  });
  log.mockRestore();
});

it("no auth session: nothing is marked", async () => {
  (requireAccount as jest.Mock).mockRejectedValueOnce(
    new Error("NEXT_REDIRECT"),
  );
  await expect(markReleaseNotesSeenAction("x")).rejects.toThrow(
    "NEXT_REDIRECT",
  );
  expect(markReleaseNotesSeen).not.toHaveBeenCalled();
});

it("takes exactly one parameter (an entry id) and no account id", () => {
  const src = fs.readFileSync(
    path.join(
      __dirname,
      "..",
      "..",
      "src",
      "app",
      "(app)",
      "release-notes-actions.ts",
    ),
    "utf8",
  );
  expect(markReleaseNotesSeenAction.length).toBe(1);
  expect(src).not.toMatch(/userId|accountId/);
});
