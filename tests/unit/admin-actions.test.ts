jest.mock("@/lib/data/account", () => ({ requireAccount: jest.fn() }));
jest.mock("next/navigation", () => ({
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
jest.mock("next/cache", () => ({ refresh: jest.fn() }));
jest.mock("@/lib/data/admin/accounts", () => ({
  suspendAccount: jest.fn(),
  reactivateAccount: jest.fn(),
}));
jest.mock("@/lib/data/admin/feedback", () => ({
  setFeedbackHandled: jest.fn(),
  setFeedbackCategory: jest.fn(),
}));

import { requireAccount } from "@/lib/data/account";
import { reactivateAccount, suspendAccount } from "@/lib/data/admin/accounts";
import {
  setFeedbackCategory,
  setFeedbackHandled,
} from "@/lib/data/admin/feedback";
import {
  reactivateAccountAction,
  suspendAccountAction,
} from "@/app/admin/accounts/[id]/actions";
import {
  setFeedbackCategoryAction,
  setFeedbackHandledAction,
} from "@/app/admin/feedback/[id]/actions";

/**
 * Every admin server action, invoked DIRECTLY (Admin Center & Feedback,
 * spec §11, §14.1; roadmap DoD 1): a non-admin gets not-found before any
 * argument reaches the data layer, and the admin's own identity always comes
 * from the session — never from an argument.
 */

const ADMIN = "11111111-1111-4111-8111-111111111111";
const LIFTER = "22222222-2222-4222-8222-222222222222";
const TARGET = "33333333-3333-4333-8333-333333333333";
const saved = process.env.OVERLOAD_ADMIN_USER_IDS;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.OVERLOAD_ADMIN_USER_IDS = ADMIN;
});
afterAll(() => {
  process.env.OVERLOAD_ADMIN_USER_IDS = saved;
});

const calls = [
  ["suspendAccountAction", () => suspendAccountAction(TARGET)],
  ["reactivateAccountAction", () => reactivateAccountAction(TARGET)],
  ["setFeedbackHandledAction", () => setFeedbackHandledAction(TARGET, true)],
  [
    "setFeedbackCategoryAction",
    () => setFeedbackCategoryAction(TARGET, "idea"),
  ],
] as const;
const dataFns = [
  suspendAccount,
  reactivateAccount,
  setFeedbackHandled,
  setFeedbackCategory,
] as jest.Mock[];

it.each(calls)(
  "%s: a signed-in non-admin gets not-found and nothing reaches the data layer",
  async (_name, call) => {
    (requireAccount as jest.Mock).mockResolvedValue({
      userId: LIFTER,
      timeZone: "UTC",
    });
    await expect(call()).rejects.toThrow("NEXT_NOT_FOUND");
    for (const fn of dataFns) expect(fn).not.toHaveBeenCalled();
  },
);

it.each(calls)(
  "%s: a suspended or signed-out caller is stopped by requireAccount first",
  async (_name, call) => {
    (requireAccount as jest.Mock).mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(call()).rejects.toThrow("NEXT_REDIRECT");
    for (const fn of dataFns) expect(fn).not.toHaveBeenCalled();
  },
);

it("an admin's action runs as the session's admin, never as an argument", async () => {
  (requireAccount as jest.Mock).mockResolvedValue({
    userId: ADMIN,
    timeZone: "America/Chicago",
  });
  (suspendAccount as jest.Mock).mockResolvedValue({ changed: true });
  await expect(suspendAccountAction(TARGET)).resolves.toEqual({
    ok: true,
    data: { changed: true },
  });
  expect(suspendAccount).toHaveBeenCalledWith(
    { userId: ADMIN, timeZone: "America/Chicago" },
    TARGET,
  );
});
