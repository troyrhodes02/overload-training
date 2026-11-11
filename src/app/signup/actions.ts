"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { signUp, type SignUpField } from "@/lib/accounts/signup";

/**
 * A coarse request fingerprint for the signup rate limiter (PA2, §9/R4). The
 * first client IP from the standard proxy headers, else a stable fallback from
 * the user-agent and language so a header-stripped request still gets limited
 * (and never evades the throttle by omitting the IP). It is NEVER the email, so
 * a rate-limit decision reveals no membership; the throttle SHA-256-hashes it
 * before it touches the database.
 */
async function requestFingerprint(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "";
  if (ip) return `ip:${ip}`;
  const ua = h.get("user-agent")?.trim() ?? "";
  const lang = h.get("accept-language")?.trim() ?? "";
  return `ua:${ua}|${lang}`;
}

export type SignUpState = {
  status: "idle" | "error" | "closed";
  fieldErrors: Partial<Record<SignUpField, string>>;
  formError:
    "email_taken" | "unexpected" | "rate_limited" | "challenge_failed" | null;
  /**
   * Invite mode only: the server-checked code was wrong. Rendered ALONE under
   * the invite-code field, with no other field feedback, so a codeless visitor
   * learns nothing about any address (Public Accounts §9, D2).
   */
  inviteInvalid: boolean;
  /** Echoed back so a failed submit keeps them — never the password. */
  values: {
    firstName: string;
    lastName: string;
    username: string;
    email: string;
  };
};

/**
 * Self-signup (OVE-50; extended by Public Accounts). Public by design — there
 * is no session yet — and gated by the server's signup mode. In invite mode a
 * valid code is required and checked first. The form carries no account id; the
 * new account's identity comes from the auth service.
 */
export async function signUpAction(
  _prev: SignUpState,
  formData: FormData,
): Promise<SignUpState> {
  const get = (k: string) => formData.get(k);
  const outcome = await signUp({
    firstName: get("firstName"),
    lastName: get("lastName"),
    username: get("username"),
    email: get("email"),
    password: get("password"),
    confirmPassword: get("confirmPassword"),
    timeZone: get("timeZone"),
    inviteCode: get("inviteCode"),
    challengeToken: get("challengeToken"),
    throttleKey: await requestFingerprint(),
  });
  if (outcome.kind === "created") redirect("/");

  const values = {
    firstName: String(get("firstName") ?? ""),
    lastName: String(get("lastName") ?? ""),
    username: String(get("username") ?? ""),
    email: String(get("email") ?? ""),
  };
  const base = { inviteInvalid: false, values };
  switch (outcome.kind) {
    case "closed":
      return { ...base, status: "closed", fieldErrors: {}, formError: null };
    case "invite_invalid":
      return {
        ...base,
        status: "error",
        fieldErrors: {},
        formError: null,
        inviteInvalid: true,
      };
    case "invalid":
      return {
        ...base,
        status: "error",
        fieldErrors: outcome.fieldErrors,
        formError: null,
      };
    case "email_taken":
      return {
        ...base,
        status: "error",
        fieldErrors: {},
        formError: "email_taken",
      };
    case "rate_limited":
      return {
        ...base,
        status: "error",
        fieldErrors: {},
        formError: "rate_limited",
      };
    case "challenge_failed":
      return {
        ...base,
        status: "error",
        fieldErrors: {},
        formError: "challenge_failed",
      };
    default:
      return {
        ...base,
        status: "error",
        fieldErrors: {},
        formError: "unexpected",
      };
  }
}
