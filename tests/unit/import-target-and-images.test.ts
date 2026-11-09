import {
  exerciseImageUrl,
  EXERCISE_IMAGE_BUCKET,
} from "@/lib/exercises/images";
import { assertImportTargetAllowed } from "../../prisma/seed/target-guard";
import { importedImageObjectPath } from "../../prisma/seed/catalog-import";

describe("catalog import target guard (OVE-111: identity by project ref)", () => {
  const PROD = "ycxvdiklpefyhdclxyau";
  const DEV = "abcdefghijklmnopqrst";
  const POOLER_HOST = "aws-0-us-east-1.pooler.supabase.com";
  const LOCAL_DB = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  const LOCAL_API = "http://127.0.0.1:54321";
  const pooled = (ref: string) =>
    `postgresql://postgres.${ref}:pw@${POOLER_HOST}:6543/postgres`;
  const api = (ref: string) => `https://${ref}.supabase.co`;
  const hosted = (ref: string, extra: Record<string, string> = {}) => ({
    DATABASE_URL: pooled(ref),
    NEXT_PUBLIC_SUPABASE_URL: api(ref),
    ...extra,
  });

  it("allows a local database with local Storage, without confirmation", () => {
    expect(
      assertImportTargetAllowed({
        DATABASE_URL: LOCAL_DB,
        NEXT_PUBLIC_SUPABASE_URL: LOCAL_API,
      }),
    ).toMatchObject({ host: "127.0.0.1", remote: false });
  });

  it("refuses mixed environments (rows and images must go to the same place)", () => {
    expect(() =>
      assertImportTargetAllowed({
        DATABASE_URL: LOCAL_DB,
        NEXT_PUBLIC_SUPABASE_URL: api(DEV),
        OVERLOAD_IMPORT_CONFIRM_REF: DEV,
      }),
    ).toThrow(/different environments/);
  });

  it("refuses a database from a different project than Storage", () => {
    expect(() =>
      assertImportTargetAllowed({
        DATABASE_URL: pooled("zyxwvutsrqponmlkjihg"),
        NEXT_PUBLIC_SUPABASE_URL: api(DEV),
        OVERLOAD_IMPORT_CONFIRM_REF: DEV,
      }),
    ).toThrow(/different projects/);
  });

  it("refuses the retired host confirmation — the pooler host is shared by every project", () => {
    expect(() =>
      assertImportTargetAllowed(
        hosted(DEV, { OVERLOAD_IMPORT_CONFIRM_HOST: POOLER_HOST }),
      ),
    ).toThrow(/no longer accepted/);
  });

  it("refuses a hosted development project without an explicit ref confirmation", () => {
    expect(() => assertImportTargetAllowed(hosted(DEV))).toThrow(
      /--confirm-ref|never sufficient/,
    );
    expect(() =>
      assertImportTargetAllowed(
        hosted(DEV, { OVERLOAD_IMPORT_CONFIRM_REF: POOLER_HOST }),
      ),
    ).toThrow(/does not match/);
  });

  it("allows the confirmed development project", () => {
    expect(
      assertImportTargetAllowed(
        hosted(DEV, { OVERLOAD_IMPORT_CONFIRM_REF: DEV }),
      ),
    ).toMatchObject({
      host: POOLER_HOST,
      remote: true,
      target: { kind: "hosted", ref: DEV, production: false },
    });
  });

  it("refuses PRODUCTION unless the --production flag AND the production ref are both given", () => {
    expect(() => assertImportTargetAllowed(hosted(PROD))).toThrow(/PRODUCTION/);
    expect(() =>
      assertImportTargetAllowed(hosted(PROD), ["--confirm-ref", PROD]),
    ).toThrow(/PRODUCTION/);
    expect(() =>
      assertImportTargetAllowed(hosted(PROD), ["--production"]),
    ).toThrow(/PRODUCTION/);
    expect(() =>
      assertImportTargetAllowed(hosted(PROD), [
        "--production",
        "--confirm-ref",
        DEV,
      ]),
    ).toThrow(/PRODUCTION/);
    expect(
      assertImportTargetAllowed(hosted(PROD), [
        "--production",
        "--confirm-ref",
        PROD,
      ]).target,
    ).toMatchObject({ ref: PROD, production: true });
  });

  it("has no environment-variable form of the production opt-in", () => {
    for (const value of ["true", "false", ""]) {
      expect(() =>
        assertImportTargetAllowed(
          hosted(PROD, {
            OVERLOAD_IMPORT_PRODUCTION: value,
            OVERLOAD_IMPORT_CONFIRM_REF: PROD,
          }),
        ),
      ).toThrow(/--production command-line flag only/);
    }
  });

  it("never treats --production as a fallback for a non-production target", () => {
    expect(() =>
      assertImportTargetAllowed(hosted(DEV), [
        "--production",
        "--confirm-ref",
        DEV,
      ]),
    ).toThrow(/not Production/);
    expect(() =>
      assertImportTargetAllowed(
        { DATABASE_URL: LOCAL_DB, NEXT_PUBLIC_SUPABASE_URL: LOCAL_API },
        ["--production"],
      ),
    ).toThrow(/local stack/);
  });

  it("accepts the dev confirmation as a flag, and refuses a conflicting env confirmation", () => {
    expect(
      assertImportTargetAllowed(hosted(DEV), ["--confirm-ref", DEV]).target,
    ).toMatchObject({ ref: DEV, production: false });
    expect(() =>
      assertImportTargetAllowed(
        hosted(DEV, { OVERLOAD_IMPORT_CONFIRM_REF: "zyxwvutsrqponmlkjihg" }),
        ["--confirm-ref", DEV],
      ),
    ).toThrow(/disagree/);
    expect(() =>
      assertImportTargetAllowed(hosted(DEV), ["--confirm-host", POOLER_HOST]),
    ).toThrow(/no longer accepted/);
  });

  it("refuses a production DIRECT_URL left in the environment beside a dev target", () => {
    expect(() =>
      assertImportTargetAllowed(
        hosted(DEV, {
          OVERLOAD_IMPORT_CONFIRM_REF: DEV,
          DIRECT_URL: `postgresql://postgres:pw@db.${PROD}.supabase.co:5432/postgres`,
        }),
      ),
    ).toThrow();
  });

  it("refuses when a target is missing or malformed", () => {
    expect(() =>
      assertImportTargetAllowed({ NEXT_PUBLIC_SUPABASE_URL: LOCAL_API }),
    ).toThrow(/DATABASE_URL is not set/);
    expect(() => assertImportTargetAllowed({ DATABASE_URL: LOCAL_DB })).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL is not set/,
    );
    expect(() =>
      assertImportTargetAllowed({
        DATABASE_URL: "not a url",
        NEXT_PUBLIC_SUPABASE_URL: LOCAL_API,
      }),
    ).toThrow(/cannot be identified/);
  });
});

describe("exercise image paths and URLs", () => {
  it("stores one image per imported exercise under a deterministic path", () => {
    expect(importedImageObjectPath("Barbell_Squat")).toBe(
      "free-exercise-db/Barbell_Squat/0.jpg",
    );
  });

  it("builds a public URL into Overload's own bucket (never the source)", () => {
    const url = exerciseImageUrl(
      "free-exercise-db/3_4_Sit-Up/0.jpg",
      "https://abc.supabase.co/",
    );
    expect(url).toBe(
      `https://abc.supabase.co/storage/v1/object/public/${EXERCISE_IMAGE_BUCKET}/free-exercise-db/3_4_Sit-Up/0.jpg`,
    );
    expect(url).not.toMatch(/github/);
  });

  it("returns null when there is no image (custom exercises, failed imports)", () => {
    expect(exerciseImageUrl(null, "https://abc.supabase.co")).toBeNull();
    expect(exerciseImageUrl("x/0.jpg", undefined)).toBeNull();
  });
});
