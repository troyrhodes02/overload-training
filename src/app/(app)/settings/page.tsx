import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { requireAccount } from "@/lib/data/account";
import { getSettingsProfile, timeZoneOptions } from "@/lib/accounts/profile";
import { getAccountAppearance } from "@/lib/accounts/appearance";
import { ProfileForm } from "@/components/settings/profile-form";
import { AppearanceSetting } from "@/components/settings/appearance-setting";
import { Button } from "@/components/ui/button";
import { ReplayTourButton } from "@/components/settings/replay-tour-button";
import { WhatsNewSection } from "@/components/settings/whats-new-section";

export const metadata = { title: "Settings · Overload" };

/**
 * Settings (Accounts design doc Screen 6): routine profile editing above, the
 * appearance preference (Personalization & Navigation Polish — the only place
 * it can be changed), the tour replay (Onboarding Tour), the way into the
 * release history (What's New), and the one irreversible action set apart
 * below, behind its own page.
 */
export default async function SettingsPage() {
  const [account, user] = await Promise.all([requireAccount(), requireUser()]);
  const [profile, appearance] = await Promise.all([
    getSettingsProfile(account),
    getAccountAppearance(account),
  ]);

  return (
    <section className="space-y-6 pb-20 md:pb-0">
      <h1 className="text-xl font-semibold">Settings</h1>
      <ProfileForm
        firstName={profile.firstName}
        lastName={profile.lastName}
        username={profile.username}
        email={user.email ?? ""}
        timeZone={profile.timeZone}
        timeZones={timeZoneOptions(profile.timeZone)}
      />
      <AppearanceSetting initial={appearance} />
      {/* Onboarding Tour: the one permanent way to take the tour again. */}
      <div className="space-y-2">
        <h2 className="text-base font-semibold">Tour</h2>
        <p className="text-sm text-muted-foreground">
          A short walk through Today, Plan, History, Goals, Gyms, and Settings.
        </p>
        <ReplayTourButton />
      </div>
      {/* What's New: the permanent way into the release history. */}
      <WhatsNewSection />
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
