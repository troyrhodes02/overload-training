/**
 * Pitch 21j — Account & Settings's read and write endpoints, end to end
 * through the route handlers (spec §13 "API"). Only Supabase Auth is
 * replaced: an opaque token "t.<userId>.s" verifies as that user. Every module
 * behind the handlers is the production code, against a real database.
 * Cross-account cases live in the isolation suite.
 */
jest.mock("next/server", () => ({
  ...jest.requireActual("next/server"),
  connection: async () => {},
}));
jest.mock("@/lib/data/access-token", () => ({
  verifyAccessToken: async (token: string) => {
    const userId = token.split(".")[1];
    return { kind: "user", userId, email: `${userId}@example.test` };
  },
}));

import { randomUUID } from "node:crypto";
import type { Account } from "@/lib/data/account";
import {
  GET as profileRoute,
  PUT as updateProfileRoute,
} from "@/app/api/mobile/v1/me/profile/route";
import { GET as planRoute } from "@/app/api/mobile/v1/me/plan/route";
import { GET as releaseNotesRoute } from "@/app/api/mobile/v1/release-notes/route";
import { POST as seenRoute } from "@/app/api/mobile/v1/me/release-notes/seen/route";
import { GET as exportRoute } from "@/app/api/mobile/v1/me/export/route";
import { GET as meRoute } from "@/app/api/mobile/v1/me/route";
import { buildAccountExport } from "@/lib/accounts/export";
import { createGym } from "@/lib/gyms/gyms";
import { billingCopy } from "@overload/shared/billing/copy";
import {
  orderedReleaseNotes,
  toReleaseNoteView,
} from "@overload/shared/release-notes/catalog";
import {
  exportFilename,
  serializeAccountExport,
} from "@overload/shared/accounts/export-file";
import type {
  MePlanDto,
  ProfileViewDto,
} from "@overload/shared/contracts/account";
import { mobileAppConfig } from "@/lib/api/mobile/version";
import { createTestAccount } from "./support/accounts";
import { getTestPrisma } from "./support/db";

type Handler = (
  request: Request,
  route: { params: Promise<never> },
) => Promise<Response>;

const db = () => getTestPrisma();

async function call(
  handler: unknown,
  account: Account,
  opts: { method?: string; json?: unknown } = {},
) {
  const headers = new Headers({
    "x-overload-app-version": "9.9.9",
    authorization: `Bearer t.${account.userId}.s`,
  });
  const body = opts.json === undefined ? undefined : JSON.stringify(opts.json);
  if (body !== undefined) headers.set("content-type", "application/json");
  const res = await (handler as Handler)(
    new Request("http://localhost/api/mobile/v1/x", {
      method: opts.method ?? (body === undefined ? "GET" : "POST"),
      headers,
      body,
    }),
    { params: Promise.resolve({}) as Promise<never> },
  );
  const text = await res.text();
  return {
    status: res.status,
    headers: res.headers,
    text,
    body: text ? JSON.parse(text) : null,
  };
}

const profileBody = (over: Record<string, unknown> = {}) => ({
  firstName: "Sam",
  lastName: "Rivera",
  username: "",
  timeZone: "UTC",
  ...over,
});

describe("E1 GET /me/profile", () => {
  it("returns the profile and a sorted zone list that contains the stored zone", async () => {
    const a = await createTestAccount("America/Chicago");
    await db().profile.update({
      where: { userId: a.userId },
      data: { firstName: "Sam", lastName: "Rivera", username: "samr" },
    });
    const r = await call(profileRoute, a);
    expect(r.status).toBe(200);
    const body = r.body as ProfileViewDto;
    expect(body.profile).toEqual({
      firstName: "Sam",
      lastName: "Rivera",
      username: "samr",
      timeZone: "America/Chicago",
    });
    expect(body.timeZones).toContain("America/Chicago");
    expect(body.timeZones).toContain("UTC");
    expect([...body.timeZones].sort((x, y) => x.localeCompare(y))).toEqual(
      body.timeZones,
    );
  });
});

describe("E2 PUT /me/profile", () => {
  it("saves names, username, and zone; GET /me shows them", async () => {
    const a = await createTestAccount();
    const r = await call(updateProfileRoute, a, {
      method: "PUT",
      json: profileBody({
        firstName: "  Jordan ",
        username: "@Jordan_1",
        timeZone: "Europe/London",
      }),
    });
    expect([r.status, r.body]).toEqual([
      200,
      {
        profile: {
          firstName: "Jordan",
          lastName: "Rivera",
          username: "jordan_1",
          timeZone: "Europe/London",
        },
      },
    ]);
    const me = await call(meRoute, a);
    expect(me.body.profile).toMatchObject({
      firstName: "Jordan",
      username: "jordan_1",
      timeZone: "Europe/London",
    });
  });

  it("refuses bad fields with the web's per-field messages and writes nothing", async () => {
    const a = await createTestAccount();
    const fields = {
      firstName: true,
      lastName: true,
      username: true,
      timeZone: true,
    };
    const before = await db().profile.findUniqueOrThrow({
      where: { userId: a.userId },
      select: fields,
    });
    const r = await call(updateProfileRoute, a, {
      method: "PUT",
      json: profileBody({
        firstName: "",
        lastName: "x".repeat(51),
        timeZone: "Mars/Olympus",
      }),
    });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("validation_error");
    expect(r.body.error.details).toMatchObject({
      firstName: "Enter your first name.",
      lastName: "Use 50 characters or fewer.",
    });
    expect(r.body.error.details.timeZone).toEqual(expect.any(String));
    expect(
      await db().profile.findUniqueOrThrow({
        where: { userId: a.userId },
        select: fields,
      }),
    ).toEqual(before);
  });

  it("a username another account holds is 'taken' and nothing more", async () => {
    const a = await createTestAccount();
    const b = await createTestAccount();
    await db().profile.update({
      where: { userId: b.userId },
      data: { username: "lifter_b" },
    });
    const r = await call(updateProfileRoute, a, {
      method: "PUT",
      json: profileBody({ username: "lifter_b" }),
    });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.text).toContain("That username is taken.");
    expect(r.text).not.toContain(b.userId);
    expect(
      (await db().profile.findUniqueOrThrow({ where: { userId: a.userId } }))
        .username,
    ).toBeNull();
  });

  it("an account with a username can't clear it; one without stays NULL", async () => {
    const a = await createTestAccount();
    const empty = await call(updateProfileRoute, a, {
      method: "PUT",
      json: profileBody(),
    });
    expect(empty.status).toBe(200);
    expect(
      (await db().profile.findUniqueOrThrow({ where: { userId: a.userId } }))
        .username,
    ).toBeNull();
    await db().profile.update({
      where: { userId: a.userId },
      data: { username: "has_one" },
    });
    const cleared = await call(updateProfileRoute, a, {
      method: "PUT",
      json: profileBody(),
    });
    expect(cleared.status).toBe(400);
    expect(cleared.body.error.details.username).toEqual(expect.any(String));
  });

  it("a body that isn't a JSON object is a 400", async () => {
    const a = await createTestAccount();
    const r = await call(updateProfileRoute, a, {
      method: "PUT",
      json: ["not", "an", "object"],
    });
    expect([r.status, r.body.error.code]).toEqual([400, "validation_error"]);
  });
});

describe("E3 GET /me/plan", () => {
  const purchaseKeys = ["prices", "canSubscribe", "canManage", "promoReminder"];

  it("Free: the web's words, no purchase field, and what Pro would add", async () => {
    const a = await createTestAccount("UTC", randomUUID(), {
      entitlement: "none",
    });
    const r = await call(planRoute, a);
    const body = r.body as MePlanDto;
    const copy = billingCopy("free", { trialDaysLeft: null, endsOn: null });
    expect(body).toMatchObject({
      displayState: "free",
      label: copy.label,
      explanation: copy.explanation,
      endsOn: null,
      problem: false,
    });
    expect(body.proIncludes.length).toBeGreaterThan(0);
    for (const key of purchaseKeys) expect(body).not.toHaveProperty(key);
  });

  it("complimentary Pro reads as complimentary", async () => {
    const a = await createTestAccount();
    const r = await call(planRoute, a);
    expect((r.body as MePlanDto).displayState).toBe("comp");
  });

  it("a paid subscription carries the real period end from the mirror", async () => {
    const a = await createTestAccount("UTC", randomUUID(), {
      entitlement: "none",
    });
    await db().billingAccount.create({
      data: {
        userId: a.userId,
        stripeCustomerId: `cus_${randomUUID()}`,
        subscriptionId: `sub_${randomUUID()}`,
        status: "active",
        interval: "month",
        currentPeriodEnd: new Date("2026-12-04T12:00:00Z"),
      },
    });
    const r = await call(planRoute, a);
    const body = r.body as MePlanDto;
    expect(body.displayState).toBe("paid_monthly");
    expect(body.endsOn).toBe("December 4, 2026");
    expect(body.explanation).toContain("December 4, 2026");
    for (const key of purchaseKeys) expect(body).not.toHaveProperty(key);
  });

  it("names plan import as a web feature when it is on", async () => {
    const prior = process.env.PLAN_IMPORT_ENABLED;
    process.env.PLAN_IMPORT_ENABLED = "true";
    try {
      const a = await createTestAccount();
      const r = await call(planRoute, a);
      const lines = (r.body as MePlanDto).proIncludes;
      const importLine = lines.find((l) => /import/i.test(l));
      if (importLine) expect(importLine).toMatch(/on the web$/);
    } finally {
      if (prior === undefined) delete process.env.PLAN_IMPORT_ENABLED;
      else process.env.PLAN_IMPORT_ENABLED = prior;
    }
  });
});

describe("E4 GET /release-notes and E5 POST /me/release-notes/seen", () => {
  it("lists the catalog newest first, exactly as the web page", async () => {
    const a = await createTestAccount();
    const r = await call(releaseNotesRoute, a);
    expect(r.body).toEqual({
      entries: orderedReleaseNotes().map(toReleaseNoteView),
    });
  });

  it("moves the seen point forward only, and refuses an unknown id", async () => {
    const catalog = orderedReleaseNotes();
    const a = await createTestAccount();
    const unknown = await call(seenRoute, a, {
      json: { throughId: "1999-01-01-nope" },
    });
    expect([unknown.status, unknown.body.error.code]).toEqual([
      400,
      "validation_error",
    ]);
    if (catalog.length < 2) return;
    const oldest = catalog[catalog.length - 1].id;
    const first = await call(seenRoute, a, { json: { throughId: oldest } });
    expect(first.status).toBe(200);
    const forward = await call(seenRoute, a, {
      json: { throughId: catalog[0].id },
    });
    expect(forward.body).toEqual({ moved: true });
    const back = await call(seenRoute, a, { json: { throughId: oldest } });
    expect(back.body).toEqual({ moved: false });
    const again = await call(seenRoute, a, {
      json: { throughId: catalog[0].id },
    });
    expect(again.body).toEqual({ moved: false });
  });

  it("a new account has no unread backlog on GET /me", async () => {
    const a = await createTestAccount();
    const me = await call(meRoute, a);
    // The account floor (What's New R12): nothing dated before the account
    // existed. An entry dated the day the account was made is not backlog,
    // so on a significant entry's own release day it may be due (21l).
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86_400_000)
      .toISOString()
      .slice(0, 10);
    for (const e of me.body.whatsNew?.entries ?? []) {
      expect(e.date >= yesterday).toBe(true);
      expect(e.date <= today).toBe(true);
    }
  });
});

describe("E7 GET /me/export", () => {
  it("is the web's export document; the shared serializer writes the web's bytes", async () => {
    const a = await createTestAccount();
    await createGym(a, { name: "Export Gym", address: null });
    const r = await call(exportRoute, a);
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    const expected = JSON.parse(JSON.stringify(await buildAccountExport(a)));
    expect(r.body).toEqual(expected);
    expect(serializeAccountExport(r.body)).toBe(
      JSON.stringify(expected, null, 2),
    );
    expect(exportFilename(r.body.exportedOn)).toBe(
      `overload-export-${r.body.exportedOn}.json`,
    );
    expect(r.text).toContain("Export Gym");
    // No secret or token ever appears in the document.
    expect(r.text).not.toMatch(/password|access_token|refresh_token/i);
  });
});

describe("E10 app-config supportEmail", () => {
  it("is the configured address, and null when unset (never the placeholder)", () => {
    expect(
      mobileAppConfig({ NEXT_PUBLIC_OVERLOAD_SUPPORT_EMAIL: " help@x.test " })
        .supportEmail,
    ).toBe("help@x.test");
    expect(mobileAppConfig({}).supportEmail).toBeNull();
    expect(
      mobileAppConfig({ NEXT_PUBLIC_OVERLOAD_SUPPORT_EMAIL: "  " })
        .supportEmail,
    ).toBeNull();
  });
});
