"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Mail, TriangleAlert } from "lucide-react";
import { sendResetEmailAction } from "@/app/admin/accounts/[id]/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * Account help on the account page (Public Accounts design doc Screen 10;
 * spec R8): one owner-only action that sends the target the same
 * password-recovery email they'd get from "Forgot password". It is not
 * destructive and changes nothing on the account, so there is no confirmation
 * dialog — only a toast naming the email and a new line in "Admin actions", or
 * an inline Alert that says nothing was sent. The server re-checks admin
 * authorization and writes the audit entry; this island only calls the action.
 */
export function AccountHelpSection({ target }: { target: { id: string } }) {
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  function send() {
    setFailed(false);
    startTransition(async () => {
      const result = await sendResetEmailAction(target.id);
      if (!result.ok) {
        setFailed(true);
        return;
      }
      toast.success(`Reset email sent to ${result.data.email}.`);
    });
  }

  return (
    <section className="space-y-2 rounded-lg border border-border p-4">
      <h2 className="text-base font-semibold">Account help</h2>
      <p className="text-sm text-muted-foreground">
        Send this account a password-reset email, the same one they&apos;d get
        from &quot;Forgot password&quot;.
      </p>
      {failed ? (
        <Alert>
          <TriangleAlert aria-hidden className="size-4" />
          <AlertDescription>
            Couldn&apos;t send the reset email. Nothing was sent. Try again.
          </AlertDescription>
        </Alert>
      ) : null}
      <Button
        variant="outline"
        className="h-11 md:h-10"
        disabled={pending}
        onClick={send}
      >
        {pending ? (
          <>
            <Loader2 aria-hidden className="size-4 animate-spin" />
            Sending…
          </>
        ) : (
          <>
            <Mail aria-hidden className="size-4" />
            Send reset email
          </>
        )}
      </Button>
    </section>
  );
}
