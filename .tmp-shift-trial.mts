/* One-off dev operator task (OVE-112 testing). Not committed. */
import pg from "pg";
import { assertOperatorTarget, verifyTargetMarker } from "./scripts/operator/target-identity.ts";

const EMAIL = "overload-staging-tester@example.com";
const DEV_REF = "vdxrmfadikwzodjljbdi";
const ENDS_AT = new Date(process.argv.find((a) => a.startsWith("--ends="))!.slice(7));
const execute = process.argv.includes("--execute");

const target = assertOperatorTarget({ env: process.env, uses: ["DATABASE_URL", "DIRECT_URL", "NEXT_PUBLIC_SUPABASE_URL"], confirmRef: DEV_REF, production: "refuse" });
if (target.kind !== "hosted" || target.ref !== DEV_REF || target.production) throw new Error("Refusing: not overload-dev.");
const c = new pg.Client({ connectionString: process.env.DIRECT_URL });
await c.connect();
console.log("identity marker:", await verifyTargetMarker(target, async (sql) => (await c.query(sql)).rows));
const u = await c.query(`SELECT id FROM auth.users WHERE email = $1`, [EMAIL]);
if (u.rows.length !== 1) throw new Error(`expected 1 user, found ${u.rows.length}`);
const userId: string = u.rows[0].id;
const t = await c.query(`SELECT id, started_at, ends_at FROM entitlements WHERE user_id=$1 AND source='trial' AND revoked_at IS NULL`, [userId]);
if (t.rows.length !== 1) throw new Error(`expected 1 trial, found ${t.rows.length}`);
const startsAt = new Date(ENDS_AT.getTime() - 14 * 86_400_000);
const fmt = (d: Date) => `${d.toISOString()} (Chicago ${d.toLocaleString("en-US", { timeZone: "America/Chicago" })})`;
console.log(`account: ${EMAIL}`);
console.log(`  trial now:  ${fmt(t.rows[0].started_at)} -> ${fmt(t.rows[0].ends_at)}`);
console.log(`  trial new:  ${fmt(startsAt)} -> ${fmt(ENDS_AT)}`);
console.log(`  reset notice shown-at: both -> NULL`);
if (!execute) { console.log("DRY RUN: nothing written."); await c.end(); process.exit(0); }
await c.query("BEGIN");
try {
  await c.query(`UPDATE entitlements SET started_at=$2, ends_at=$3, updated_at=now() WHERE id=$1`, [t.rows[0].id, startsAt, ENDS_AT]);
  await c.query(`UPDATE profiles SET trial_ending_notice_at=NULL, trial_ended_notice_at=NULL, updated_at=now() WHERE user_id=$1`, [userId]);
  await c.query("COMMIT");
  console.log("APPLIED.");
} catch (e) { await c.query("ROLLBACK"); throw e; }
await c.end();
