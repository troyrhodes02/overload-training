import {
  exerciseImageUrl,
  EXERCISE_IMAGE_BUCKET,
} from "@/lib/exercises/images";
import { assertImportTargetAllowed } from "../../prisma/seed/target-guard";
import { importedImageObjectPath } from "../../prisma/seed/catalog-import";

describe("catalog import target guard", () => {
  const LOCAL_DB = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  const LOCAL_API = "http://127.0.0.1:54321";
  const PROD_POOLER =
    "postgresql://postgres.abcdref:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres";
  const PROD_DIRECT =
    "postgresql://postgres:pw@db.abcdref.supabase.co:5432/postgres";
  const PROD_API = "https://abcdref.supabase.co";
  const OTHER_API = "https://otherref.supabase.co";

  it("allows a local database with local Storage, without confirmation", () => {
    expect(assertImportTargetAllowed(LOCAL_DB, LOCAL_API, undefined)).toEqual({
      host: "127.0.0.1",
      remote: false,
    });
    expect(
      assertImportTargetAllowed(
        "postgresql://u:p@localhost:5432/db",
        "http://localhost:54321",
        undefined,
      ).remote,
    ).toBe(false);
  });

  it("refuses mixed environments (rows and images must go to the same place)", () => {
    expect(() =>
      assertImportTargetAllowed(LOCAL_DB, PROD_API, undefined),
    ).toThrow(/different environments/);
    expect(() =>
      assertImportTargetAllowed(
        PROD_POOLER,
        LOCAL_API,
        "aws-0-us-east-1.pooler.supabase.com",
      ),
    ).toThrow(/different environments/);
  });

  it("refuses a remote database from a different Supabase project than Storage", () => {
    expect(() =>
      assertImportTargetAllowed(
        PROD_POOLER,
        OTHER_API,
        "aws-0-us-east-1.pooler.supabase.com",
      ),
    ).toThrow(/does not belong/);
  });

  it("refuses a remote target unless the exact database host is confirmed", () => {
    expect(() =>
      assertImportTargetAllowed(PROD_POOLER, PROD_API, undefined),
    ).toThrow(/Refusing/);
    expect(() =>
      assertImportTargetAllowed(PROD_POOLER, PROD_API, "some-other-host"),
    ).toThrow(/Refusing/);
    expect(
      assertImportTargetAllowed(
        PROD_POOLER,
        PROD_API,
        "aws-0-us-east-1.pooler.supabase.com",
      ),
    ).toEqual({ host: "aws-0-us-east-1.pooler.supabase.com", remote: true });
    expect(
      assertImportTargetAllowed(PROD_DIRECT, PROD_API, "db.abcdref.supabase.co")
        .remote,
    ).toBe(true);
  });

  it("refuses when a target is missing or malformed", () => {
    expect(() =>
      assertImportTargetAllowed(undefined, LOCAL_API, undefined),
    ).toThrow();
    expect(() =>
      assertImportTargetAllowed(LOCAL_DB, undefined, undefined),
    ).toThrow();
    expect(() =>
      assertImportTargetAllowed("not a url", LOCAL_API, undefined),
    ).toThrow();
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
