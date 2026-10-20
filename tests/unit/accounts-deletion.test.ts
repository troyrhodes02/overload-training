jest.mock("@/lib/supabase/admin", () => ({
  createConfirmedUser: jest.fn(),
  deleteAuthUser: jest.fn(),
}));
jest.mock("@/lib/data/account", () => ({ requireAccount: jest.fn() }));
jest.mock("@/lib/auth", () => ({ requireUser: jest.fn() }));
jest.mock("@/lib/accounts/password", () => ({
  verifyCurrentPassword: jest.fn(),
}));
jest.mock("@/lib/accounts/deletion", () => {
  const actual = jest.requireActual("@/lib/accounts/deletion");
  return { ...actual, deleteAccount: jest.fn() };
});
const signOut = jest.fn();
jest.mock("@/lib/supabase/server", () => ({
  createServerSupabase: jest.fn(async () => ({ auth: { signOut } })),
}));
jest.mock("next/cache", () => ({ refresh: jest.fn() }));
jest.mock("next/navigation", () => ({
  redirect: jest.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

import { ownedModels, SHARED_OR_OWNED_MODEL } from "@/lib/data/scope";
import { ACCOUNT_DELETION_ORDER, deleteAccount } from "@/lib/accounts/deletion";
import { requireAccount } from "@/lib/data/account";
import { requireUser } from "@/lib/auth";
import { verifyCurrentPassword } from "@/lib/accounts/password";
import {
  deleteAccountAction,
  type DeleteAccountState,
} from "@/app/(app)/settings/delete-account/actions";

const idle: DeleteAccountState = {
  status: "idle",
  fieldError: null,
  formError: null,
};
const ACCOUNT = {
  userId: "a0000000-0000-4000-8000-000000000001",
  timeZone: "UTC",
  db: {},
};

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("ACCOUNT_DELETION_ORDER (spec §8)", () => {
  it("covers every owned model (and Exercise) exactly once", () => {
    const expected = [...ownedModels(), SHARED_OR_OWNED_MODEL].sort();
    expect([...ACCOUNT_DELETION_ORDER].sort()).toEqual(expected);
    expect(new Set(ACCOUNT_DELETION_ORDER).size).toBe(
      ACCOUNT_DELETION_ORDER.length,
    );
  });

  it("deletes children before parents and the profile (ownership root) last", () => {
    const at = (m: string) =>
      ACCOUNT_DELETION_ORDER.indexOf(
        m as (typeof ACCOUNT_DELETION_ORDER)[number],
      );
    expect(at("LoggedSet")).toBeLessThan(at("LoggedExercise"));
    expect(at("LoggedExercise")).toBeLessThan(at("LoggedSession"));
    expect(at("LoggedExercise")).toBeLessThan(at("SessionExercise"));
    expect(at("LoggedSession")).toBeLessThan(at("Session"));
    expect(at("SessionExercise")).toBeLessThan(at("Session"));
    expect(at("Session")).toBeLessThan(at("Mesocycle"));
    expect(at("Goal")).toBeLessThan(at("Exercise"));
    expect(at("GymExerciseBaseline")).toBeLessThan(at("Gym"));
    expect(at("ExerciseFavorite")).toBeLessThan(at("Exercise"));
    expect(ACCOUNT_DELETION_ORDER.at(-1)).toBe("Profile");
  });
});

describe("deleteAccountAction (spec §14.6)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireAccount as jest.Mock).mockResolvedValue(ACCOUNT);
    (requireUser as jest.Mock).mockResolvedValue({
      id: ACCOUNT.userId,
      email: "will@example.com",
    });
  });

  it("needs a password and deletes nothing without one", async () => {
    expect(await deleteAccountAction(idle, form({ password: "" }))).toEqual({
      status: "error",
      fieldError: "Enter your password to confirm.",
      formError: null,
    });
    expect(verifyCurrentPassword).not.toHaveBeenCalled();
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("a wrong password deletes nothing", async () => {
    (verifyCurrentPassword as jest.Mock).mockResolvedValue("wrong");
    expect(
      await deleteAccountAction(idle, form({ password: "nope" })),
    ).toMatchObject({ fieldError: "That password isn't right." });
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("checks the SESSION's email and acts on the SESSION's account, whatever the form says", async () => {
    (verifyCurrentPassword as jest.Mock).mockResolvedValue("ok");
    (deleteAccount as jest.Mock).mockResolvedValue({
      deleted: {},
      identityRemoved: true,
    });
    await expect(
      deleteAccountAction(
        idle,
        form({
          password: "right",
          email: "someone-else@example.com",
          userId: "b0000000-0000-4000-8000-000000000002",
        }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT:/login?notice=deleted");
    expect(verifyCurrentPassword).toHaveBeenCalledWith(
      "will@example.com",
      "right",
    );
    expect(deleteAccount).toHaveBeenCalledWith(ACCOUNT);
    expect(signOut).toHaveBeenCalled();
  });

  it("reports a failed transaction as nothing deleted", async () => {
    (verifyCurrentPassword as jest.Mock).mockResolvedValue("ok");
    (deleteAccount as jest.Mock).mockRejectedValue(new Error("db"));
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    expect(
      await deleteAccountAction(idle, form({ password: "right" })),
    ).toMatchObject({ formError: "nothing_deleted" });
    log.mockRestore();
  });

  it("reports data deleted but identity pending, without signing out", async () => {
    (verifyCurrentPassword as jest.Mock).mockResolvedValue("ok");
    (deleteAccount as jest.Mock).mockResolvedValue({
      deleted: {},
      identityRemoved: false,
    });
    expect(
      await deleteAccountAction(idle, form({ password: "right" })),
    ).toMatchObject({ formError: "identity_pending" });
    expect(signOut).not.toHaveBeenCalled();
  });

  it("rate limiting and an unreachable auth service delete nothing", async () => {
    (verifyCurrentPassword as jest.Mock).mockResolvedValueOnce("rate_limited");
    expect(
      await deleteAccountAction(idle, form({ password: "x" })),
    ).toMatchObject({ formError: "rate_limited" });
    (verifyCurrentPassword as jest.Mock).mockResolvedValueOnce("unavailable");
    expect(
      await deleteAccountAction(idle, form({ password: "x" })),
    ).toMatchObject({ formError: "nothing_deleted" });
    expect(deleteAccount).not.toHaveBeenCalled();
  });
});
