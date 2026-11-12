import type { Account } from "@/lib/data/account";
import { createTestAccount } from "./support/accounts";
import { requireCapability } from "@/lib/entitlements/require";
import { isPlanImportEnabled } from "@/lib/import/config";

/**
 * Workout Plan Import & Review (Pitch 22, AC P22-06/P22-07) — the server-side
 * gate every import action shares. A Free account that calls a Pro import path
 * DIRECTLY gets `plan_required` (hiding the button is never the gate); an active
 * Pro/trial/comp account passes. The kill switch is OFF unless
 * PLAN_IMPORT_ENABLED is exactly "true", and it fails closed on any other value.
 *
 * The actions themselves compose these two checks (guardImport in
 * src/app/(app)/plan/import/actions.ts); this proves the pieces they rest on.
 */

describe("plan_import capability gate (P22-06)", () => {
  let pro: Account;
  let free: Account;

  beforeEach(async () => {
    pro = await createTestAccount(); // default comp = Pro
    free = await createTestAccount("UTC", undefined, { entitlement: "none" });
  });

  it("a Pro account passes requireCapability", async () => {
    await expect(requireCapability(pro, "plan_import")).resolves.toMatchObject({
      plan: "pro",
    });
  });

  it("a Free account is refused with plan_required, not forbidden", async () => {
    await expect(requireCapability(free, "plan_import")).rejects.toMatchObject({
      code: "plan_required",
    });
  });
});

describe("PLAN_IMPORT_ENABLED kill switch (P22-07)", () => {
  const original = process.env.PLAN_IMPORT_ENABLED;
  afterEach(() => {
    if (original === undefined) delete process.env.PLAN_IMPORT_ENABLED;
    else process.env.PLAN_IMPORT_ENABLED = original;
  });

  it("is OFF by default (unset)", () => {
    delete process.env.PLAN_IMPORT_ENABLED;
    expect(isPlanImportEnabled()).toBe(false);
  });

  it("fails closed on any value other than the exact string 'true'", () => {
    for (const v of ["false", "1", "TRUE", "yes", "", "on"]) {
      process.env.PLAN_IMPORT_ENABLED = v;
      expect([v, isPlanImportEnabled()]).toEqual([v, false]);
    }
  });

  it("is ON only for the exact string 'true'", () => {
    process.env.PLAN_IMPORT_ENABLED = "true";
    expect(isPlanImportEnabled()).toBe(true);
  });
});
