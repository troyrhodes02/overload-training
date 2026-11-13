import { getTestPrisma } from "./support/db";
import {
  TARGET_MARKER_SCHEMA,
  TargetRefused,
  targetMarker,
  targetMarkerSetupSql,
  verifyTargetMarker,
  type VerifiedTarget,
} from "../../scripts/operator/target-identity";

/**
 * OVE-111 — the database identity marker against a REAL Postgres (the
 * throwaway embedded test database, never Supabase). Proves the one-time
 * setup SQL an operator pastes into the development project's SQL editor
 * produces exactly what the read-only verification query expects, and that a
 * missing or wrong marker is refused.
 */

const DEV = "abcdefghijklmnopqrst";
const OTHER = "zyxwvutsrqponmlkjihg";
const dev: VerifiedTarget = {
  kind: "hosted",
  ref: DEV,
  host: "aws-0-us-east-1.pooler.supabase.com",
  production: false,
};
const query = (sql: string) =>
  getTestPrisma().$queryRawUnsafe<{ marker: string | null }[]>(sql);

async function setMarker(ref: string) {
  for (const statement of targetMarkerSetupSql(ref).split(";\n")) {
    await getTestPrisma().$executeRawUnsafe(statement.replace(/;$/, ""));
  }
}

afterEach(async () => {
  await getTestPrisma().$executeRawUnsafe(
    `DROP SCHEMA IF EXISTS ${TARGET_MARKER_SCHEMA}`,
  );
});

describe("database identity marker (real Postgres)", () => {
  it("is refused when the marker schema does not exist", async () => {
    await expect(verifyTargetMarker(dev, query)).rejects.toThrow(TargetRefused);
  });

  it("verifies after the documented one-time setup", async () => {
    await setMarker(DEV);
    await expect(verifyTargetMarker(dev, query)).resolves.toBe("verified");
    const rows = await query(
      `SELECT pg_catalog.obj_description(n.oid, 'pg_namespace') AS marker FROM pg_catalog.pg_namespace n WHERE n.nspname = '${TARGET_MARKER_SCHEMA}'`,
    );
    expect(rows).toEqual([{ marker: targetMarker(DEV) }]);
  });

  it("is refused when the marker names another project", async () => {
    await setMarker(OTHER);
    await expect(verifyTargetMarker(dev, query)).rejects.toThrow(
      /does not match/,
    );
  });

  it("creates no table (so there is no RLS surface to open)", async () => {
    await setMarker(DEV);
    const tables = await getTestPrisma().$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM information_schema.tables WHERE table_schema = '${TARGET_MARKER_SCHEMA}'`,
    );
    expect(Number(tables[0].n)).toBe(0);
  });
});
