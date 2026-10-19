import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireAccount } from "@/lib/data/account";
import { accountInventory } from "@/lib/accounts/deletion";
import { DeleteAccountForm } from "@/components/settings/delete-account-form";

export const metadata = { title: "Delete account · Overload" };

/**
 * The one irreversible action (Accounts design doc Screen 7): what will be
 * destroyed, in the lifter's own numbers, then the password as confirmation.
 */
export default async function DeleteAccountPage() {
  const account = await requireAccount();
  const inventory = await accountInventory(account);

  return (
    <section className="space-y-6 pb-36 md:pb-0">
      <Link
        href="/settings"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft aria-hidden className="size-4" />
        Settings
      </Link>
      <h1 className="text-xl font-semibold">Delete your account</h1>
      <p className="text-sm">
        This permanently deletes your account and everything in it. It
        can&apos;t be undone.
      </p>
      <DeleteAccountForm inventory={inventory} />
    </section>
  );
}
