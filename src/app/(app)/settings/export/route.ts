import { requireAccountForDataRights } from "@/lib/data/account";
import { buildAccountExport, exportFilename } from "@/lib/accounts/export";

/**
 * GET /settings/export — the data-export download (Public Accounts spec §9,
 * R7; design doc Screen 8, D4).
 *
 * A route handler, not a server action, because it streams a file a server
 * action cannot. It:
 *   1. resolves the acting account from the session through the narrow
 *      data-rights guard (requireAccountForDataRights) — a signed-out request
 *      is redirected to /login; a SUSPENDED account may still download its
 *      own data (OVE-125 / audit F-A7), unlike every other surface;
 *   2. assembles the account's complete export (reads only through account.db);
 *   3. responds with the JSON as an attachment named
 *      overload-export-YYYY-MM-DD.json.
 *
 * It is READ-ONLY: it writes nothing. The acting account is never taken from
 * the request (no query, body, or header is read); it comes from the session
 * alone, so this surface cannot be aimed at another account.
 *
 * It is inherently dynamic: the guard reads the session cookie, so the
 * handler runs per request, and the response carries `Cache-Control: no-store`
 * so no layer retains one account's file. (No `dynamic` segment config: this
 * repo's cacheComponents config rejects it, and the cookie read already forces
 * per-request execution.)
 */

export async function GET(): Promise<Response> {
  const { account } = await requireAccountForDataRights();
  const data = await buildAccountExport(account);
  const body = JSON.stringify(data, null, 2);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFilename(data.exportedOn)}"`,
      "Cache-Control": "no-store",
    },
  });
}
