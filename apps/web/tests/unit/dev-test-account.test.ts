/**
 * Pitch 21f (OVE-219; spec §11): the disposable test-account command's pure
 * rules. Which accounts it may ever act on, what each profile seeds and for
 * which day, how its arguments are read, and where a password may be
 * written. The target guards themselves are the provisioning tool's and the
 * operator identity module's, covered by their own suites.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ACCOUNTS_DIR,
  PROFILES,
  PROFILE_NAMES,
  profileOf,
  anchorFor,
  argsProblem,
  credentialsFileFor,
  parseArgs,
  usernameFor,
} from "../../scripts/dev-test-account/profiles";
import { DEMO_VARIANTS, demoFixture } from "../../scripts/demo/fixture";
import {
  compareCall,
  observedState,
  type ObservedCall,
} from "../../scripts/dev-test-account/engine-check";
import { writeCredentialsFile } from "../../scripts/operator/provision-dev-test-user/cli";

const ROOT = path.resolve(__dirname, "..", "..");
const cli = () =>
  fs.readFileSync(path.join(ROOT, "scripts/dev-test-account/cli.ts"), "utf8");
/** Code only: comments may legitimately name what they forbid. */
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const args = (...argv: string[]) => parseArgs(argv);
const ok = (...extra: string[]) =>
  args("--email", "21f-gym@example.com", "--profile", "gym", ...extra);

describe("profiles", () => {
  it("one per scenario, each a real fixture variant", () => {
    expect(PROFILE_NAMES).toEqual([
      "standard",
      "gym",
      "bodyweight",
      "cardio",
      "missed",
      // Pitch 21g insight scenarios.
      "progress",
      "hold",
      "reactive-deload",
      "rir",
      "scheduled-deload",
      "post-deload",
      "insufficient",
      "edit",
      "free",
      "entitlement",
      "summary",
      "recovery",
      "isolation-a",
      "isolation-b",
    ]);
    for (const name of PROFILE_NAMES) {
      expect(DEMO_VARIANTS).toContain(PROFILES[name].variant);
    }
  });

  it("every profile is anchored to the account's today, except a missed day", () => {
    for (const name of ["standard", "gym", "bodyweight", "cardio"] as const) {
      expect(anchorFor(name, "2026-11-17")).toBe("2026-11-17");
    }
    // Yesterday's workout was never logged: a real missed day.
    expect(anchorFor("missed", "2026-11-17")).toBe("2026-11-16");
    expect(anchorFor("missed", "2026-12-01")).toBe("2026-11-30");
    expect(PROFILES.missed.variant).toBe("standard");
  });
});

describe("Pitch 21g profiles", () => {
  it("only `free` starts on the Free plan; every other profile is Pro", () => {
    for (const name of PROFILE_NAMES) {
      expect(profileOf(name).access).toBe(name === "free" ? "free" : "pro");
    }
  });

  it("every 21g profile is anchored to today and promises calls on lifts its fixture plans today", () => {
    for (const name of PROFILE_NAMES.slice(5)) {
      const p = profileOf(name);
      expect(p.anchorOffsetDays).toBe(0);
      const upperA = demoFixture(p.variant).sessions.find(
        (s) => s.key === "upperA",
      )!;
      for (const e of p.expect) {
        expect(upperA.slots.map((s) => s.ex)).toContain(e.ex);
      }
    }
  });

  it("isolation-a and isolation-b hold different training data", () => {
    const a = demoFixture(profileOf("isolation-a").variant);
    const b = demoFixture(profileOf("isolation-b").variant);
    expect(a.library).not.toEqual(b.library);
  });
});

describe("the engine check (pure)", () => {
  const call = (over: Partial<ObservedCall> = {}): ObservedCall => ({
    tag: null,
    rirEffect: null,
    suggestion: null,
    recommendation: null,
    locked: null,
    ...over,
  });
  it("reads the state from the server's fields only", () => {
    expect(observedState(call({ locked: "progression_insights" }))).toBe(
      "locked",
    );
    expect(observedState(call())).toBe("insufficient");
    expect(
      observedState(
        call({ suggestion: { lbs: 160, kind: "scheduled_deload" } }),
      ),
    ).toBe("deload_week");
    expect(
      observedState(
        call({ tag: "stalled", recommendation: { kind: "hold", action: "x" } }),
      ),
    ).toBe("stalled");
    expect(
      observedState(call({ recommendation: { kind: "hold", action: "x" } })),
    ).toBe("hold");
  });
  it("reports a wrong state, a wrong RIR effect, or a wrong sentence", () => {
    const progress = call({
      tag: "progress",
      recommendation: { kind: "progress", action: "Try 185 lb today (+5 lb)" },
    });
    expect(
      compareCall(
        { ex: "BENCH", call: "progress", action: "Try 185 lb today (+5 lb)" },
        progress,
      ),
    ).toBeNull();
    expect(compareCall({ ex: "BENCH", call: "hold" }, progress)).toMatch(
      /expected hold, engine says progress/,
    );
    expect(
      compareCall(
        { ex: "BENCH", call: "progress", rirEffect: "released_stall" },
        progress,
      ),
    ).toMatch(/RIR effect/);
    expect(
      compareCall(
        { ex: "BENCH", call: "progress", action: "Try 190" },
        progress,
      ),
    ).toMatch(/expected "Try 190"/);
  });
});

describe("arguments", () => {
  it("reads the email, profile, and flags; lowercases what is compared", () => {
    expect(
      args(
        "--email",
        " 21F-Gym@Example.com ",
        "--profile",
        "GYM",
        "--confirm-ref",
        "vdxrmfadikwzodjljbdi",
        "--execute",
      ),
    ).toEqual({
      email: "21f-gym@example.com",
      profile: "gym",
      username: undefined,
      confirmRef: "vdxrmfadikwzodjljbdi",
      execute: true,
      unexpected: [],
    });
  });

  it("is a dry run unless --execute is given", () => {
    expect(ok().execute).toBe(false);
  });

  it("accepts a complete request", () => {
    expect(argsProblem(ok())).toBeNull();
    expect(argsProblem(ok("--username", "gym_tester"))).toBeNull();
  });

  it("always needs an explicit email and a known profile", () => {
    expect(argsProblem(args("--profile", "gym"))).toMatch(/--email/);
    expect(argsProblem(args("--email", "nope", "--profile", "gym"))).toMatch(
      /--email/,
    );
    expect(argsProblem(args("--email", "a@example.com"))).toMatch(/--profile/);
    expect(
      argsProblem(args("--email", "a@example.com", "--profile", "legs")),
    ).toMatch(/standard, gym, bodyweight, cardio, missed/);
  });

  it("refuses any email that isn't on a reserved test domain", () => {
    for (const email of [
      "someone@gmail.com",
      "owner@overloadtraining.app",
      "a@example.co",
      "a@notexample.com",
    ]) {
      expect(argsProblem(args("--email", email, "--profile", "gym"))).toMatch(
        /reserved test domain/,
      );
    }
    for (const email of [
      "tester@example.com",
      "tester@qa.test",
      "tester@x.example.org",
    ]) {
      expect(
        argsProblem(args("--email", email, "--profile", "gym")),
      ).toBeNull();
    }
  });

  it("refuses unknown flags, including any override", () => {
    for (const flag of ["--force", "--production", "--reset", "--delete"]) {
      expect(argsProblem(ok(flag))).toMatch(/Unexpected argument/);
    }
  });

  it("refuses a username the app would refuse", () => {
    expect(argsProblem(ok("--username", "x"))).toMatch(/--username/);
    expect(argsProblem(ok("--username", "has spaces"))).toMatch(/--username/);
    expect(
      argsProblem(args("--email", "a@example.com", "--profile", "gym")),
    ).toMatch(/--username/);
  });
});

describe("the username from an email", () => {
  it("keeps letters, digits, and underscores, within 20 characters", () => {
    expect(usernameFor("21f-gym@example.com")).toBe("21f_gym");
    expect(usernameFor("21f-isolation-a@example.com")).toBe("21f_isolation_a");
    expect(usernameFor("-Odd..Name+tag-@example.com")).toBe("odd_name_tag");
    expect(
      usernameFor("a-very-long-local-part-for-a-test@example.com"),
    ).toHaveLength(20);
  });
});

describe("the password file", () => {
  it("lives outside the repository, one per account", () => {
    expect(ACCOUNTS_DIR).toBe(
      path.join(os.homedir(), ".overload-dev", "accounts"),
    );
    expect(
      path.resolve(ACCOUNTS_DIR).startsWith(path.resolve(ROOT, "..", "..")),
    ).toBe(false);
    expect(credentialsFileFor("21f-gym@example.com")).toBe(
      path.join(ACCOUNTS_DIR, "21f-gym@example.com.txt"),
    );
  });

  it("a name can never leave the directory", () => {
    const dir = path.join(os.tmpdir(), "accounts");
    for (const email of ["../../etc/passwd@example.com", "a/b@example.com"]) {
      const file = credentialsFileFor(email, dir);
      expect(path.dirname(file)).toBe(dir);
    }
  });

  it("is owner-only and never overwritten", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "overload-accounts-"));
    try {
      const file = credentialsFileFor("21f-gym@example.com", dir);
      writeCredentialsFile("21f-gym@example.com", "first-password", file);
      expect(fs.statSync(file).mode & 0o777).toBe(0o600);
      expect(() =>
        writeCredentialsFile("21f-gym@example.com", "second", file),
      ).toThrow();
      expect(fs.readFileSync(file, "utf8")).toContain("first-password");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("--access (Pitch 21g RD-16)", () => {
  const access = (...extra: string[]) =>
    args("--email", "21g-entitlement@example.com", ...extra);
  it("switches an existing test account: needs pro or free, and no profile", () => {
    expect(argsProblem(access("--access", "free"))).toBeNull();
    expect(argsProblem(access("--access", "PRO"))).toBeNull();
    expect(argsProblem(access("--access", "admin"))).toMatch(/pro or free/);
    expect(
      argsProblem(access("--access", "free", "--profile", "progress")),
    ).toMatch(/takes no --profile/);
  });
  it("still refuses a non-test email", () => {
    expect(
      argsProblem(args("--email", "someone@gmail.com", "--access", "free")),
    ).toMatch(/reserved test domain/);
  });
});

describe("the command itself", () => {
  it("never prints a password, a key, or a connection string", () => {
    const src = code(cli());
    const printed = [...src.matchAll(/console\.(log|error)\(([\s\S]*?)\);/g)]
      .map((m) => m[2])
      .join("\n");
    // No log line interpolates a password value.
    expect(printed).not.toMatch(/\$\{[^}]*password[^}]*\}/i);
    expect(printed).not.toMatch(/SERVICE_ROLE|DATABASE_URL|DIRECT_URL/);
    expect(src).not.toMatch(/console\.\w+\([^)]*provisioned\.password/);
  });

  it("has no delete, reset, or merge path, and reads no .env file", () => {
    const src = code(cli());
    expect(src).not.toMatch(/\.delete(Many)?\(|\$executeRaw|TRUNCATE|DROP /i);
    expect(src).not.toMatch(
      /ACCOUNT_DELETION_STEPS|deleteAccount|qa-fixture\/qa/,
    );
    // It reads only what the operator exported (process.env): it never
    // loads an env file, and never reads any file at all.
    expect(src).not.toMatch(/dotenv|loadEnvFile|readFile/);
  });

  it("refuses Production in the file itself, before any connection", () => {
    const src = code(cli());
    expect(src).toContain('production: "refuse"');
    expect(src).not.toMatch(/productionOptIn|--production/);
    expect(src.indexOf("assertOperatorTarget(")).toBeLessThan(
      src.indexOf("new PrismaClient"),
    );
    expect(src.indexOf("guardProvisionTarget(")).toBeLessThan(
      src.indexOf("new PrismaClient"),
    );
    expect(src).toMatch(/verifyTargetMarker\(/);
  });
});
