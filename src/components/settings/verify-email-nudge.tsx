"use client";

import { startTransition, useReducer } from "react";
import { Check, Mail, X } from "lucide-react";
import { toast } from "sonner";
import { sendVerificationEmailAction } from "@/app/(app)/settings/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * The email-verification nudge inside the Settings Profile card (Public
 * Accounts design Screen 6, D1/D2). It NEVER blocks anything on the page.
 *
 *  - Unverified: a dismissible neutral Alert with "Send verification email".
 *    Dismiss hides it for the session only (local state); it returns on a
 *    later visit while still unverified (the server re-renders unverified).
 *  - Sent: the Alert swaps in place to honest "sent" copy with a "send it
 *    again" link. No countdown, no modal, no color change.
 *  - Verified: no nudge — only a quiet "Verified" caption (no badge, no
 *    color, no toast) sits under the address (D2).
 *
 * Verification gates nothing (CLAUDE.md; spec §9), so there is no disabled
 * state, no gate, and no upgrade language here.
 */

/** The nudge's visible state, as a reducer so it is unit-testable. */
export type NudgeState = "unverified" | "sent" | "dismissed";

export type NudgeAction =
  { type: "send" } | { type: "dismiss" } | { type: "reset" };

export function nudgeReducer(
  state: NudgeState,
  action: NudgeAction,
): NudgeState {
  switch (action.type) {
    case "send":
      // Sending always shows the "sent" copy, even from a re-send in "sent".
      return "sent";
    case "dismiss":
      // Dismiss only applies to the unverified prompt; a sent confirmation
      // stays until the page is left (nothing to dismiss there).
      return state === "unverified" ? "dismissed" : state;
    case "reset":
      return "unverified";
    default:
      return state;
  }
}

export function VerifyEmailNudge({
  email,
  verified,
}: {
  email: string;
  verified: boolean;
}) {
  const [state, dispatch] = useReducer(nudgeReducer, "unverified");

  // Verified is the ordinary case: only a quiet caption (D2). No nudge.
  if (verified) {
    return (
      <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Check className="size-3.5" aria-hidden="true" /> Verified
      </p>
    );
  }

  if (state === "dismissed") return null;

  function send() {
    dispatch({ type: "send" });
    startTransition(async () => {
      const result = await sendVerificationEmailAction();
      // The link only reaches the account's own inbox, so success is the
      // normal path. A rare failure is surfaced quietly so the lifter can
      // retry; the copy never reveals auth internals.
      if (!result.ok) {
        toast.error("Couldn't send the verification email. Try again.", {
          duration: 6000,
        });
        dispatch({ type: "reset" });
      }
    });
  }

  if (state === "sent") {
    return (
      <Alert role="status">
        <Mail className="size-4" aria-hidden="true" />
        <AlertDescription>
          <span>
            Verification email sent to <strong>{email}</strong>. Follow the link
            in it to verify.
          </span>
          <span className="mt-1 block">
            <button
              type="button"
              onClick={send}
              className="text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              Didn&apos;t arrive? Send it again.
            </button>
          </span>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert>
      <AlertDescription>
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-2">
            <span>
              Your email isn&apos;t verified yet. Verify it so you&apos;re ready
              when paid plans arrive.
            </span>
            <div>
              <Button
                type="button"
                variant="link"
                className="h-auto p-0 text-primary"
                onClick={send}
              >
                Send verification email
              </Button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => dispatch({ type: "dismiss" })}
            aria-label="Dismiss"
            className="shrink-0 rounded-sm text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
