"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { TriangleAlert } from "lucide-react";
import {
  reactivateAccountAction,
  suspendAccountAction,
} from "@/app/admin/accounts/[id]/actions";
import type { AccountStatusValue } from "@/lib/admin/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/**
 * Access on the account page (Admin Center & Feedback design doc Screens
 * 5–6; spec R17, R18): one deliberate action behind an alertdialog that
 * names the account and says what happens. A repeat (another tab got there
 * first) says so and changes nothing; a failure keeps the dialog open and
 * says nothing changed. Admin accounts have no action here.
 */
export function AccessSection({
  target,
}: {
  target: {
    id: string;
    /** The name, or the email when the account has none. */
    label: string;
    email: string | null;
    status: AccountStatusValue;
    isAdmin: boolean;
  };
}) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const suspend = target.status === "active";

  if (target.isAdmin) {
    return (
      <section className="space-y-2 rounded-lg border border-border p-4">
        <h2 className="text-base font-semibold">Access</h2>
        <p className="text-sm text-muted-foreground">
          Admin accounts can&apos;t be suspended here.
        </p>
      </section>
    );
  }

  function confirm() {
    setFailed(false);
    startTransition(async () => {
      const result = await (suspend
        ? suspendAccountAction(target.id)
        : reactivateAccountAction(target.id));
      if (!result.ok) {
        setFailed(true);
        return;
      }
      setOpen(false);
      if (!result.data.changed) {
        toast.info(suspend ? "Already suspended." : "Already active.");
      } else {
        toast.success(
          suspend
            ? `${target.label} is suspended.`
            : `${target.label} can use Overload again.`,
        );
      }
    });
  }

  const who = target.email ?? target.label;

  return (
    <section className="space-y-2 rounded-lg border border-border p-4">
      <h2 className="text-base font-semibold">Access</h2>
      <p className="text-sm text-muted-foreground">
        {suspend
          ? "This account can use Overload."
          : "Suspended accounts can't use Overload. Their training history is kept."}
      </p>
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          if (pending) return;
          setOpen(next);
          if (!next) setFailed(false);
        }}
      >
        <Button
          variant="outline"
          className={
            suspend
              ? "h-11 border-destructive/40 text-destructive hover:text-destructive md:h-10"
              : "h-11 md:h-10"
          }
          onClick={() => setOpen(true)}
        >
          {suspend ? "Suspend account…" : "Reactivate account…"}
        </Button>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {suspend ? "Suspend" : "Reactivate"} {target.label}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {suspend
                ? `${who} won't be able to use Overload, starting with their next request, even if they're signed in now. Nothing in the account is deleted, and you can reactivate it any time.`
                : `${who} will be able to sign in and use Overload again, with everything as they left it.`}
            </AlertDialogDescription>
            <p className="text-sm text-muted-foreground">
              This is recorded in the audit log.
            </p>
          </AlertDialogHeader>
          {failed ? (
            <Alert>
              <TriangleAlert aria-hidden className="size-4" />
              <AlertDescription>
                Couldn&apos;t change the account. Nothing changed. Try again.
              </AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <Button
              variant={suspend ? "destructive" : "default"}
              disabled={pending}
              onClick={confirm}
            >
              {pending
                ? suspend
                  ? "Suspending…"
                  : "Reactivating…"
                : suspend
                  ? "Suspend"
                  : "Reactivate"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
