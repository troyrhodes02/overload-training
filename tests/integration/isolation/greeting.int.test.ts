import { getGreetingFacts } from "@/lib/personalization/greeting-facts";
import { getTestPrisma } from "../support/db";
import { createTestAccount } from "../support/accounts";
import {
  createTestMesocycle,
  createTestSession,
} from "../support/plan-factories";

/**
 * Greeting facts (Personalization & Navigation Polish, spec §14.1, §14.4):
 * the first name, the stored zone's usability, and "first visit" come only
 * from the acting account's own profile and history.
 */

const setProfile = (
  userId: string,
  data: { firstName?: string | null; timeZone?: string; createdAt?: Date },
) => getTestPrisma().profile.update({ where: { userId }, data });

async function logASession(userId: string) {
  const m = await createTestMesocycle({ userId });
  const s = await createTestSession(m.id, { userId });
  await getTestPrisma().loggedSession.create({
    data: {
      userId,
      mesocycleId: m.id,
      sessionId: s.id,
      performedOn: new Date("2026-10-05T12:00:00Z"),
      scheduledFor: new Date("2026-10-05T00:00:00Z"),
    },
  });
}

describe("first visit", () => {
  it("is true on the profile's first local day with nothing logged", async () => {
    const a = await createTestAccount("America/Chicago");
    expect((await getGreetingFacts(a)).firstVisit).toBe(true);
  });

  it("is false the next local day", async () => {
    const a = await createTestAccount("America/Chicago");
    const tomorrow = new Date(Date.now() + 36 * 3600 * 1000);
    expect((await getGreetingFacts(a, tomorrow)).firstVisit).toBe(false);
  });

  it("is false once any workout is logged, even on day one", async () => {
    const a = await createTestAccount("America/Chicago");
    await logASession(a.userId);
    expect((await getGreetingFacts(a)).firstVisit).toBe(false);
  });

  it("follows the account's zone across midnight", async () => {
    const a = await createTestAccount("America/Chicago");
    // Created 23:30 Chicago on Oct 18 (04:30 UTC Oct 19).
    await setProfile(a.userId, { createdAt: new Date("2026-10-19T04:30:00Z") });
    // 23:50 the same Chicago day → still the first day.
    expect(
      (await getGreetingFacts(a, new Date("2026-10-19T04:50:00Z"))).firstVisit,
    ).toBe(true);
    // 00:10 next Chicago day → no longer.
    expect(
      (await getGreetingFacts(a, new Date("2026-10-19T05:10:00Z"))).firstVisit,
    ).toBe(false);
  });

  it("another account's history never makes this account 'not first'", async () => {
    const a = await createTestAccount();
    const b = await createTestAccount();
    await logASession(a.userId);
    expect((await getGreetingFacts(a)).firstVisit).toBe(false);
    expect((await getGreetingFacts(b)).firstVisit).toBe(true);
  });
});

describe("first name and timezone", () => {
  it("reads only the acting account's own first name, trimmed", async () => {
    const a = await createTestAccount();
    const b = await createTestAccount();
    await setProfile(a.userId, { firstName: "  Sam " });
    await setProfile(b.userId, { firstName: "Jordan" });
    expect((await getGreetingFacts(a)).firstName).toBe("Sam");
    expect((await getGreetingFacts(b)).firstName).toBe("Jordan");
  });

  it("no saved name (the original account) is null", async () => {
    const a = await createTestAccount();
    expect((await getGreetingFacts(a)).firstName).toBeNull();
    await setProfile(a.userId, { firstName: "   " });
    expect((await getGreetingFacts(a)).firstName).toBeNull();
  });

  it("an unusable stored zone is reported, a real one (UTC included) is not", async () => {
    const a = await createTestAccount("UTC");
    expect((await getGreetingFacts(a)).timeZoneValid).toBe(true);
    await setProfile(a.userId, { timeZone: "Not/AZone" });
    const facts = await getGreetingFacts(a);
    expect(facts.timeZoneValid).toBe(false);
    // Still a sensible answer: first visit falls back to the UTC day.
    expect(typeof facts.firstVisit).toBe("boolean");
  });
});
