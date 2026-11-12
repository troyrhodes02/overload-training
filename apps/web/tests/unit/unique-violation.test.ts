jest.mock("@/lib/db", () => ({ prisma: {} }));
jest.mock("@/lib/auth", () => ({ requireUser: jest.fn() }));

import { Prisma } from "@prisma/client";
import { isUniqueViolation } from "@/lib/actions/result";
import { isUniqueViolation as planIsUniqueViolation } from "@/lib/plan/write-support";

/**
 * The one P2002 check (src/lib/actions/result.ts), used by the plan, cardio,
 * and account modules. Structural on purpose (no Prisma runtime import in the
 * shared module) — this proves it still recognises real Prisma errors.
 */
const known = (code: string) =>
  new Prisma.PrismaClientKnownRequestError("db error", {
    code,
    clientVersion: Prisma.prismaVersion.client,
  });

it("recognises a real Prisma unique violation and nothing else", () => {
  expect(isUniqueViolation(known("P2002"))).toBe(true);
  expect(isUniqueViolation(known("P2003"))).toBe(false);
  expect(isUniqueViolation(new Error("P2002"))).toBe(false);
  expect(isUniqueViolation({ code: "P2002" })).toBe(false);
  expect(isUniqueViolation(null)).toBe(false);
  expect(isUniqueViolation("P2002")).toBe(false);
});

it("the plan modules use the same check", () => {
  expect(planIsUniqueViolation).toBe(isUniqueViolation);
});
