import { assertTestDatabaseUrl } from "../integration/support/assert-test-db";

describe("assertTestDatabaseUrl", () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
  });

  it("throws when TEST_DATABASE_URL is unset (never falls back to DATABASE_URL)", () => {
    delete process.env.TEST_DATABASE_URL;
    process.env.DATABASE_URL = "postgresql://should-not-be-used@host/db";
    expect(() => assertTestDatabaseUrl()).toThrow(
      /TEST_DATABASE_URL is not set/,
    );
  });

  it("throws when TEST_DATABASE_URL points at a Supabase host", () => {
    process.env.TEST_DATABASE_URL =
      "postgresql://u:p@db.abcd.supabase.co:5432/postgres";
    expect(() => assertTestDatabaseUrl()).toThrow(/Supabase host/);
  });

  it("throws when TEST_DATABASE_URL equals DATABASE_URL", () => {
    const url = "postgresql://u:p@127.0.0.1:5433/overload_test";
    process.env.TEST_DATABASE_URL = url;
    process.env.DATABASE_URL = url;
    expect(() => assertTestDatabaseUrl()).toThrow(/equals DATABASE_URL/);
  });

  it("accepts a throwaway local URL", () => {
    delete process.env.DATABASE_URL;
    process.env.TEST_DATABASE_URL =
      "postgresql://test:test@127.0.0.1:5433/overload_test";
    expect(assertTestDatabaseUrl()).toContain("127.0.0.1");
  });
});
