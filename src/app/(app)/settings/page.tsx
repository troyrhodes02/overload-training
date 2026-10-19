import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { requireAccount } from "@/lib/data/account";
import { getSettingsProfile, timeZoneOptions } from "@/lib/accounts/profile";
import { ProfileForm } from "@/components/settings/profile-form";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Settings · Overload" };

/**
 * Settings (Accounts design doc Screen 6): routine profile editing above, the
 * one irreversible action set apart below, behind its own page.
 */
export default async function SettingsPage() {
  const [account, user] = await Promise.all([requireAccount(), requireUser()]);
  const profile = await getSettingsProfile(account);

  return (
    <section className="space-y-6 pb-20 md:pb-0">
      <h1 className="text-xl font-semibold">Settings</h1>
      <ProfileForm
        firstName={profile.firstName}
        lastName={profile.lastName}
        email={user.email ?? ""}
        timeZone={profile.timeZone}
        timeZones={timeZoneOptions(profile.timeZone)}
      />
      <div className="space-y-2 border-t border-border pt-6">
        <h2 className="text-base font-semibold">Delete account</h2>
        <p className="text-sm text-muted-foreground">
          Permanently delete your account and all of its training history.
        </p>
        <Button
          asChild
          variant="outline"
          className="border-destructive/40 text-destructive hover:text-destructive"
        >
          <Link href="/settings/delete-account">Delete account…</Link>
        </Button>
      </div>
    </section>
  );
}
