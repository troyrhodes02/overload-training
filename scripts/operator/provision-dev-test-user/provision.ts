/**
 * Development test-account provisioning (staging). Operator tooling for the
 * ONE development project (`overload-dev`) — never Production, never imported
 * by `src/`, no route.
 *
 * It creates, in the development project only:
 *   - one Supabase Auth user (admin API, email pre-confirmed, no email sent),
 *   - its application Profile (+ tour row, as a normal signup creates),
 *   - one comp Pro entitlement (reason "tester"): Overload's own state, no
 *     Stripe, no subscription, no billing row.
 * It seeds no training data, calls no model API, and sends no email.
 *
 * Idempotent and create-only. An existing Auth user is REUSED and its password
 * is never touched. Nothing is deleted except an Auth user THIS run created and
 * could not finish setting up (compensation), so a failed run leaves nothing.
 */
import { randomInt } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

/** The only project this tool will ever write to. */
export const DEV_PROJECT_REF = "vdxrmfadikwzodjljbdi";

/** Clearly development-only and non-routable: example.com is reserved (RFC 2606). */
export const DEFAULT_TEST_EMAIL = "overload-staging-tester@example.com";
export const DEFAULT_TEST_USERNAME = "staging_tester";
export const DEFAULT_TIME_ZONE = "America/Chicago";

export class ProvisionRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProvisionRefused";
  }
}

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const DIGITS = "23456789";
const SYMBOLS = "-_.!@#%*+=?";
const ALL = UPPER + LOWER + DIGITS + SYMBOLS;

/**
 * A 28-character password from the OS CSPRNG (crypto.randomInt is unbiased),
 * guaranteed to contain every character class. Never logged by this module.
 */
export function generatePassword(length = 28): string {
  if (length < 16) throw new ProvisionRefused("Password length must be >= 16.");
  const pick = (set: string) => set[randomInt(set.length)];
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < length) chars.push(pick(ALL));
  // Fisher–Yates with the CSPRNG.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

/** The slice of the Supabase Auth admin API this tool uses. */
export type AuthAdmin = {
  findUserIdByEmail(email: string): Promise<string | null>;
  createConfirmedUser(input: {
    email: string;
    password: string;
  }): Promise<{ id: string }>;
  deleteUser(id: string): Promise<void>;
};

type Db = Pick<
  PrismaClient,
  "profile" | "entitlement" | "tourProgress" | "$transaction"
>;

export type ProvisionInput = {
  email: string;
  username: string;
  timeZone: string;
  now?: Date;
};

export type ProvisionPlan = {
  email: string;
  authUser: "exists" | "will-create";
  userId: string | null;
  profile: "exists" | "will-create" | "will-create-after-auth";
  proComp: "active" | "will-grant";
};

export type ProvisionResult = {
  status: "created" | "already-existed";
  userId: string;
  /** Present only when THIS run generated one (a new Auth user). */
  password?: string;
  profile: "created" | "existed";
  proComp: "granted" | "already-active";
};

export async function planProvision(
  db: Db,
  auth: AuthAdmin,
  input: ProvisionInput,
): Promise<ProvisionPlan> {
  const userId = await auth.findUserIdByEmail(input.email);
  if (!userId) {
    return {
      email: input.email,
      authUser: "will-create",
      userId: null,
      profile: "will-create-after-auth",
      proComp: "will-grant",
    };
  }
  const profile = await db.profile.findUnique({
    where: { userId },
    select: { userId: true },
  });
  const comp = await db.entitlement.findFirst({
    where: { userId, source: "comp", revokedAt: null },
    select: { id: true },
  });
  return {
    email: input.email,
    authUser: "exists",
    userId,
    profile: profile ? "exists" : "will-create",
    proComp: comp ? "active" : "will-grant",
  };
}

/**
 * Apply the plan. Profile, tour row and comp are written in ONE transaction,
 * create-only. If anything after Auth-user creation fails and THIS run created
 * that user, the user is deleted again (best effort) and the error rethrown.
 */
export async function executeProvision(
  db: Db,
  auth: AuthAdmin,
  input: ProvisionInput,
  makePassword: () => string = generatePassword,
): Promise<ProvisionResult> {
  const now = input.now ?? new Date();
  let userId = await auth.findUserIdByEmail(input.email);
  let password: string | undefined;
  let createdAuth = false;

  if (!userId) {
    password = makePassword();
    userId = (await auth.createConfirmedUser({ email: input.email, password }))
      .id;
    createdAuth = true;
  }
  const id = userId;

  try {
    const outcome = await db.$transaction(async (tx) => {
      const existing = await tx.profile.findUnique({
        where: { userId: id },
        select: { userId: true },
      });
      if (!existing) {
        const taken = await tx.profile.findUnique({
          where: { username: input.username },
          select: { userId: true },
        });
        if (taken) {
          throw new ProvisionRefused(
            `Username "${input.username}" belongs to a different account; nothing was changed.`,
          );
        }
        await tx.profile.create({
          data: {
            userId: id,
            firstName: "Staging",
            lastName: "Tester",
            username: input.username,
            timeZone: input.timeZone,
            // The address is a reserved non-routable one; this marks the
            // dev test account as verified so no verification gate blocks it.
            emailVerifiedAt: now,
          },
        });
      }
      await tx.tourProgress.createMany({
        data: [{ userId: id }],
        skipDuplicates: true,
      });
      const comp = await tx.entitlement.findFirst({
        where: { userId: id, source: "comp", revokedAt: null },
        select: { id: true },
      });
      if (!comp) {
        await tx.entitlement.create({
          data: {
            userId: id,
            source: "comp",
            plan: "pro",
            startedAt: now,
            endsAt: null,
            compReason: "tester",
            compNote:
              "Development staging test account (provision-dev-test-user)",
            // grantedByUserId stays null: an operator action, not an admin's.
          },
        });
      }
      return {
        profile: existing ? "existed" : "created",
        comp: !comp,
      } as const;
    });
    return {
      status: createdAuth ? "created" : "already-existed",
      userId: id,
      ...(password ? { password } : {}),
      profile: outcome.profile,
      proComp: outcome.comp ? "granted" : "already-active",
    };
  } catch (error) {
    if (createdAuth) {
      await auth.deleteUser(id).catch(() => undefined);
    }
    throw error;
  }
}

export function formatPlan(plan: ProvisionPlan): string {
  return [
    "Development test account",
    `  email:        ${plan.email}`,
    `  auth user:    ${plan.authUser === "exists" ? "exists (password untouched)" : "would create (email pre-confirmed, no email sent)"}`,
    `  profile:      ${plan.profile === "exists" ? "exists" : "would create"}`,
    `  Pro (comp):   ${plan.proComp === "active" ? "already active" : "would grant (reason: tester, no end date, no Stripe)"}`,
  ].join("\n");
}
