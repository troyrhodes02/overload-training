import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { requireAccount } from "@/lib/data/account";
import { getSettingsProfile, timeZoneOptions } from "@/lib/accounts/profile";
import { getAccountAppearance } from "@/lib/accounts/appearance";
import { getEmailVerification } from "@/lib/accounts/verification";
import { getBillingScreen } from "@/lib/billing/screen";
import { tourAnchor } from "@/lib/tour/steps";
import { ProfileForm } from "@/components/settings/profile-form";
import { DataExportSection } from "@/components/settings/data-export-section";
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
  const [profile, appearance, verification, billing] = await Promise.all([
    getSettingsProfile(account),
    getAccountAppearance(account),
    getEmailVerification(account, user.email ?? ""),
    getBillingScreen(account),
  ]);

  return (
    <section className="space-y-6 pb-20 md:pb-0">
      <h1 className="text-xl font-semibold">Settings</h1>
      <ProfileForm
        firstName={profile.firstName}
        lastName={profile.lastName}
        username={profile.username}
        email={user.email ?? ""}
        emailVerified={verification.verified}
        timeZone={profile.timeZone}
        timeZones={timeZoneOptions(profile.timeZone)}
      />
      <AppearanceSetting initial={appearance} />
      {/* Plans, Billing & Promo Codes: the plan lives on its own leaf; this row
          shows the resolved state and links to it (design Screen 5). */}
      <div className="space-y-2">
        <h2 className="text-base font-semibold">Plan &amp; Billing</h2>
        <Link
          href="/settings/billing"
          {...tourAnchor("settings-billing")}
          className="flex items-center justify-between rounded-lg border border-border bg-card p-4 text-sm hover:bg-muted"
        >
          <span>Plan &amp; Billing</span>
          <span className="text-xs tabular-nums text-muted-foreground">
            {billing.shortLabel} ›
          </span>
        </Link>
      </div>
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
      {/* Public Accounts: the complete, private, Free data export (R7). It sits
          below the profile (which carries Timezone) and above the one
          irreversible action. */}
      <DataExportSection />
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
      {/* Public Landing Page & Changelog (design Screen 8): the public pages a
          signed-in lifter still needs to reach. Plain links, nothing more. */}
      <nav
        aria-label="Overload"
        className="flex gap-3 text-xs text-muted-foreground"
      >
        <Link href="/changelog" className="hover:text-foreground">
          Changelog
        </Link>
        <span aria-hidden>·</span>
        <Link href="/privacy" className="hover:text-foreground">
          Privacy
        </Link>
        <span aria-hidden>·</span>
        <Link href="/terms" className="hover:text-foreground">
          Terms
        </Link>
      </nav>
    </section>
  );
}
