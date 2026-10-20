"use server";

import { redirect } from "next/navigation";
import { signUp, type SignUpField } from "@/lib/accounts/signup";

export type SignUpState = {
  status: "idle" | "error" | "closed";
  fieldErrors: Partial<Record<SignUpField, string>>;
  formError: "email_taken" | "unexpected" | null;
  /** Echoed back so a failed submit keeps them — never the password. */
  values: {
    firstName: string;
    lastName: string;
    username: string;
    email: string;
  };
};

/**
 * Self-signup (OVE-50). Public by design — there is no session yet — and
 * open only while the server's signup switch is on. The form carries no
 * account id; the new account's identity comes from the auth service.
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
  });
  if (outcome.kind === "created") redirect("/");

  const values = {
    firstName: String(get("firstName") ?? ""),
    lastName: String(get("lastName") ?? ""),
    username: String(get("username") ?? ""),
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
