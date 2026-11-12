import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import {
  DeleteAccountBillingNote,
  DeleteAccountForm,
} from "@/components/settings/delete-account-form";
import { accountInventory } from "@/lib/accounts/deletion";
import { requireAccountForDataRights } from "@/lib/data/account";

export const metadata: Metadata = {
  title: "Delete account — Overload",
};

// Reads the auth session and the account's status at request time.
export const instant = false;

/**
 * Account deletion for a SUSPENDED account (OVE-125 / audit F-A7). Suspension
 * stops someone using Overload; it never stops them removing their account.
 * The Settings delete page lives inside the app shell, which refuses a
 * suspended account, so this is the same inventory and the same password
 * confirmation (DeleteAccountForm → deleteAccountAction) in the unauthenticated
 * frame /suspended uses. An active account is sent to the Settings page.
 */
export default async function SuspendedDeleteAccountPage() {
  const { account, suspended } = await requireAccountForDataRights();
  if (!suspended) redirect("/settings/delete-account");
  const inventory = await accountInventory(account);

  return (
    <AuthCard>
      <div className="space-y-6 pb-32 md:pb-0">
        <div className="space-y-2">
          <h1 className="text-lg font-semibold">Delete your account</h1>
          <p className="text-sm">
            This permanently deletes your account and everything in it. It
            can&apos;t be undone.
          </p>
          <DeleteAccountBillingNote />
        </div>
        <DeleteAccountForm inventory={inventory} cancelHref="/suspended" />
      </div>
    </AuthCard>
  );
}
