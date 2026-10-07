import {
  exerciseImageUrl,
  EXERCISE_IMAGE_BUCKET,
} from "@/lib/exercises/images";
import { assertImportTargetAllowed } from "../../prisma/seed/target-guard";
import { importedImageObjectPath } from "../../prisma/seed/catalog-import";

describe("catalog import target guard", () => {
  it("allows local databases without confirmation", () => {
    expect(
      assertImportTargetAllowed(
        "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
        undefined,
      ),
    ).toEqual({ host: "127.0.0.1", remote: false });
    expect(
      assertImportTargetAllowed("postgresql://u:p@localhost:5432/db", undefined)
        .remote,
    ).toBe(false);
  });

  it("refuses a remote database unless the exact host is confirmed", () => {
    const prod =
      "postgresql://u:p@aws-0-us-east-1.pooler.supabase.com:6543/postgres";
    expect(() => assertImportTargetAllowed(prod, undefined)).toThrow(
      /Refusing/,
    );
    expect(() => assertImportTargetAllowed(prod, "some-other-host")).toThrow(
      /Refusing/,
    );
    expect(
      assertImportTargetAllowed(prod, "aws-0-us-east-1.pooler.supabase.com"),
    ).toEqual({ host: "aws-0-us-east-1.pooler.supabase.com", remote: true });
  });

  it("refuses when there is no target", () => {
    expect(() => assertImportTargetAllowed(undefined, undefined)).toThrow();
    expect(() => assertImportTargetAllowed("not a url", undefined)).toThrow();
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
