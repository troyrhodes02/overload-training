"use server";

import { redirect } from "next/navigation";
import { signUp, type SignUpField } from "@/lib/accounts/signup";

export type SignUpState = {
  status: "idle" | "error" | "closed";
  fieldErrors: Partial<Record<SignUpField, string>>;
  formError: "email_taken" | "unexpected" | null;
  /** Echoed back so a failed submit keeps them — never the password. */
  values: {
    inviteCode: string;
    firstName: string;
    lastName: string;
    email: string;
  };
};

/**
 * Invite-gated signup (Accounts spec §11). Public by design — there is no
 * session yet — so the invite code, checked on the server first, is the
 * gate. The form carries no account id; the new account's identity comes from
 * the auth service.
 */
export async function signUpAction(
  _prev: SignUpState,
  formData: FormData,
): Promise<SignUpState> {
  const get = (k: string) => formData.get(k);
  const outcome = await signUp({
    inviteCode: get("inviteCode"),
    firstName: get("firstName"),
    lastName: get("lastName"),
    email: get("email"),
    password: get("password"),
    timeZone: get("timeZone"),
  });
  if (outcome.kind === "created") redirect("/");

  const values = {
    inviteCode: String(get("inviteCode") ?? ""),
    firstName: String(get("firstName") ?? ""),
    lastName: String(get("lastName") ?? ""),
    email: String(get("email") ?? ""),
  };
  switch (outcome.kind) {
    case "closed":
      return { status: "closed", fieldErrors: {}, formError: null, values };
    case "invalid":
      return {
        status: "error",
        fieldErrors: outcome.fieldErrors,
        formError: null,
        values,
      };
    case "email_taken":
      return {
        status: "error",
        fieldErrors: {},
        formError: "email_taken",
        values,
      };
    default:
      return {
        status: "error",
        fieldErrors: {},
        formError: "unexpected",
        values,
      };
  }
}
