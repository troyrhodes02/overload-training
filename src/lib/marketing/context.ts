import "server-only";
import { connection } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { signupMode } from "@/lib/accounts/signup-gate";
import { isCheckoutEnabled } from "@/lib/billing/config";
import { FAIL_CLOSED_CONTEXT, type MarketingContext } from "./cta";

/**
 * The server facts the public pages' calls to action depend on (spec §4):
 * whether this request has an auth session (the boolean only — no profile is
 * read or created, and no account data is touched), the signup mode, and the
 * billing kill switch. Read per request, never baked in at build and never
 * taken from the browser. Any failure falls back to the fail-closed context,
 * so a public page never offers an action that might not work.
 */
export async function getMarketingContext(): Promise<MarketingContext> {
  await connection();
  try {
    const user = await getAuthUser();
    return {
      signedIn: user !== null,
      signupMode: signupMode(),
      billingEnabled: isCheckoutEnabled(),
    };
  } catch {
    return FAIL_CLOSED_CONTEXT;
  }
}
