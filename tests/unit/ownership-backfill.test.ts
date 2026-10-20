import { Prisma } from "@prisma/client";
import {
  LEGACY_OWNED_TABLES,
  PRESERVED_TABLES,
} from "../../scripts/operator/account-ownership/backfill";
import { parseArgs } from "../../scripts/operator/account-ownership/cli";

/**
 * Multi-User Foundation — the Stage 2 backfill must cover every table that can
 * hold pre-ownership rows. If a later pitch adds an owned table, this fails
 * until the backfill (and the enforce migration's guard) know about it.
 */
describe("ownership backfill coverage", () => {
  const owned = Prisma.dmmf.datamodel.models
    .filter((m) => m.fields.some((f) => f.name === "userId"))
    .map((m) => m.dbName ?? m.name);

  it("assigns every owned table except the two created empty by migration 9 (and later tables)", () => {
    // Tables created after ownership was enforced can never hold pre-ownership
    // rows: Onboarding Tour's tour_progress (9d) and What's New's
    // release_seen (9e) are born owned.
    const BORN_OWNED = ["tour_progress", "release_seen"];
    expect([...LEGACY_OWNED_TABLES].sort()).toEqual(
      owned
        .filter(
          (t) =>
            ![
              "profiles",
              "exercise_favorites",
              "exercises",
              ...BORN_OWNED,
            ].includes(t),
        )
        .sort(),
    );
  });

  it("fingerprints every legacy table, including the shared exercises", () => {
    expect([...PRESERVED_TABLES].sort()).toEqual(
      [...LEGACY_OWNED_TABLES, "exercises"].sort(),
    );
  });
});

describe("backfill CLI arguments", () => {
  it("defaults to a dry run", () => {
    expect(
      parseArgs(["--email", "a@b.c", "--time-zone", "America/Chicago"]),
    ).toEqual({
      email: "a@b.c",
      timeZone: "America/Chicago",
      confirmHost: undefined,
      execute: false,
      unexpected: [],
    });
  });

  it("reads --execute and --confirm-host", () => {
    const args = parseArgs([
      "--email",
      "a@b.c",
      "--time-zone",
      "UTC",
      "--execute",
      "--confirm-host",
      "db.example.supabase.co",
    ]);
    expect(args.execute).toBe(true);
    expect(args.confirmHost).toBe("db.example.supabase.co");
  });

  it("collects anything unexpected (e.g. PowerShell dropping `--` options)", () => {
    expect(parseArgs(["a@b.c", "--execute"]).unexpected).toEqual(["a@b.c"]);
    expect(parseArgs(["--email"]).unexpected).toEqual(["--email"]);
  });
});
