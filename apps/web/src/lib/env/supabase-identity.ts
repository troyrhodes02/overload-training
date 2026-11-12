/**
 * Supabase target identity (OVE-111) — PURE parsing, no I/O, no secrets.
 *
 * Overload has exactly two hosted Supabase projects: Production
 * (`ycxvdiklpefyhdclxyau`) and the development project that Vercel Preview
 * uses. Through Supabase's shared pooler, both are reached at the SAME regional
 * hostname (`aws-0-<region>.pooler.supabase.com`), so a hostname can never tell
 * them apart. The project is identified instead by:
 *
 *   - pooler connections: the username suffix  `postgres.<ref>`
 *   - direct connections: the project host     `db.<ref>.supabase.co`
 *   - the API URL:        the project host     `<ref>.supabase.co`
 *
 * Anything that cannot be pinned to exactly one project (a pooler URL without
 * a ref in its username, a username ref that disagrees with the host ref, an
 * unrecognized remote host, a loopback host carrying a hosted ref) is
 * "unknown", and every caller treats unknown as a refusal.
 *
 * Shared by the operator target guard (scripts/operator/target-identity.ts)
 * and the Preview deployment tripwire (./deployment-guard.ts). Nothing here
 * returns or echoes a credential: results carry only refs, hostnames, and
 * reasons.
 */

/** Known Production project refs. A match anywhere is a refusal for dev tooling. */
export const PRODUCTION_PROJECT_REFS = ["ycxvdiklpefyhdclxyau"] as const;

/** Supabase project refs are 20 lowercase alphanumerics. */
const REF = /^[a-z0-9]{20}$/;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const SUPABASE_TLD = String.raw`supabase\.(?:co|com|in|net)`;
const DIRECT_HOST = new RegExp(String.raw`^db\.([a-z0-9]+)\.${SUPABASE_TLD}$`);
const API_HOST = new RegExp(String.raw`^([a-z0-9]+)\.${SUPABASE_TLD}$`);
const POOLER_HOST = new RegExp(String.raw`(^|\.)pooler\.${SUPABASE_TLD}$`);
const ANY_SUPABASE_HOST = new RegExp(String.raw`(^|\.)${SUPABASE_TLD}$`);

export type TargetIdentity =
  | { kind: "local"; host: string }
  | {
      kind: "supabase";
      ref: string;
      host: string;
      via: "pooler-username" | "direct-host" | "api-host";
    }
  | { kind: "unknown"; reason: string };

export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host);
}

export function isProductionRef(ref: string | undefined | null): boolean {
  if (!ref) return false;
  const lower = ref.trim().toLowerCase();
  return PRODUCTION_PROJECT_REFS.some((p) => p === lower);
}

/**
 * True when the raw value names a Production ref anywhere (host, username,
 * path, query, any letter case). Deliberately a substring test: it is the
 * catch-all that does not depend on the URL parsing correctly.
 */
export function mentionsProductionRef(raw: string | undefined | null): boolean {
  if (!raw) return false;
  const lower = raw.toLowerCase();
  return PRODUCTION_PROJECT_REFS.some((p) => lower.includes(p));
}

function parse(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

/** The ref a Postgres username carries (`postgres.<ref>`), if any. */
function usernameRef(user: string): string | null | "malformed" {
  const dot = user.lastIndexOf(".");
  if (dot < 0) return null;
  const suffix = user.slice(dot + 1);
  return REF.test(suffix) ? suffix : "malformed";
}

/** Identify which project a Postgres connection string reaches. */
export function identifyDatabaseUrl(raw: string): TargetIdentity {
  const url = parse(raw);
  if (!url) return { kind: "unknown", reason: "is not a valid URL" };
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    return { kind: "unknown", reason: "is not a postgres:// URL" };
  }
  const host = url.hostname.toLowerCase();
  let user: string;
  try {
    user = decodeURIComponent(url.username).toLowerCase();
  } catch {
    return { kind: "unknown", reason: "has an undecodable username" };
  }
  const fromUser = usernameRef(user);
  if (fromUser === "malformed") {
    return {
      kind: "unknown",
      reason: "has a username whose project suffix is not a Supabase ref",
    };
  }

  if (isLoopbackHost(host)) {
    if (fromUser) {
      return {
        kind: "unknown",
        reason:
          "is a loopback host but its username names a hosted project (a tunnel?)",
      };
    }
    return { kind: "local", host };
  }

  const direct = DIRECT_HOST.exec(host);
  if (direct) {
    const hostRef = direct[1];
    if (!REF.test(hostRef)) {
      return { kind: "unknown", reason: "has a malformed project host" };
    }
    if (fromUser && fromUser !== hostRef) {
      return {
        kind: "unknown",
        reason: "names one project in its username and another in its host",
      };
    }
    return { kind: "supabase", ref: hostRef, host, via: "direct-host" };
  }

  if (POOLER_HOST.test(host)) {
    if (!fromUser) {
      return {
        kind: "unknown",
        reason:
          "is a shared Supabase pooler without a project ref in its username (postgres.<ref>)",
      };
    }
    return { kind: "supabase", ref: fromUser, host, via: "pooler-username" };
  }

  if (ANY_SUPABASE_HOST.test(host)) {
    return { kind: "unknown", reason: "is an unrecognized Supabase host" };
  }
  return {
    kind: "unknown",
    reason: "is a remote host that is not a recognized Supabase project",
  };
}

/** Identify which project a Supabase API URL (NEXT_PUBLIC_SUPABASE_URL) names. */
export function identifySupabaseUrl(raw: string): TargetIdentity {
  const url = parse(raw);
  if (!url) return { kind: "unknown", reason: "is not a valid URL" };
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { kind: "unknown", reason: "is not an http(s) URL" };
  }
  const host = url.hostname.toLowerCase();
  if (isLoopbackHost(host)) return { kind: "local", host };
  const api = API_HOST.exec(host);
  if (api && REF.test(api[1])) {
    return { kind: "supabase", ref: api[1], host, via: "api-host" };
  }
  return {
    kind: "unknown",
    reason:
      "is not a recognized Supabase project URL (https://<ref>.supabase.co)",
  };
}
