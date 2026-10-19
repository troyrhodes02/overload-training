import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * The reset email's link lands here (Accounts spec R7): the auth service's
 * one-time `token_hash` is verified on the server, which signs the lifter in
 * with a short-lived recovery auth session (cookies) and continues to
 * /reset-password. Anything else — another type, a missing, used, or expired
 * token — goes back to the request form. Nothing about the account is shown.
 */
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const to = (path: string) =>
    NextResponse.redirect(new URL(path, request.url), 303);

  if (type !== "recovery" || !tokenHash) {
    return to("/forgot-password?link=expired");
  }
  try {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.verifyOtp({
      type: "recovery",
      token_hash: tokenHash,
    });
    if (error) return to("/forgot-password?link=expired");
  } catch {
    return to("/forgot-password?link=expired");
  }
  return to("/reset-password");
}
