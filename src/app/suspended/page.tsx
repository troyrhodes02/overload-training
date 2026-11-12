import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getAccessState } from "@/lib/data/account";
import { signOutAction } from "@/app/login/actions";

export const metadata: Metadata = {
  title: "Account suspended — Overload",
};

// Reads the auth session and the account's status at request time.
export const instant = false;

/**
 * Where a suspended account lands on its next request (Admin Center &
 * Feedback design doc Screen 11; spec section 7, R22). It says plainly why
 * Overload won't open and lets the lifter sign out; it names no admin, no
 * reason, and no date. An active account is sent to Today and a signed-out
 * visitor to the login screen.
 *
 * Suspension never takes away a lifter's data rights (OVE-125 / audit F-A7):
 * they can still download their data and delete their account from here.
 */
export default async function SuspendedPage() {
  const state = await getAccessState();
  if (state === "signed_out") redirect("/login");
  if (state === "active") redirect("/");

  return (
    <AuthCard>
      <h1 className="text-lg font-semibold">Your account is suspended</h1>
      <p className="text-sm text-muted-foreground">
        You can&apos;t use Overload while it&apos;s suspended. Nothing in your
        account has been deleted.
      </p>
      <p className="text-sm text-muted-foreground">
        If you think this is a mistake, contact the person who runs Overload.
      </p>
      <div className="space-y-2">
        <Button asChild variant="outline" className="h-11 w-full">
          <a href="/settings/export" download>
            Download your data
          </a>
        </Button>
        <Button asChild variant="ghost" className="h-11 w-full">
          <Link href="/suspended/delete-account">Delete your account</Link>
        </Button>
      </div>
      <form action={signOutAction}>
        <Button type="submit" variant="outline" className="h-11 w-full">
          Sign out
        </Button>
      </form>
    </AuthCard>
  );
}
