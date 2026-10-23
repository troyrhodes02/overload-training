import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireAdmin } from "@/lib/data/admin/identity";
import { getAdminAccount } from "@/lib/data/admin/accounts";
import { fullDate } from "@/lib/admin/format";
import { personName } from "@/lib/admin/types";
import { AccessSection } from "@/components/admin/access-section";
import {
  AccountStatusBadge,
  AdminBadge,
} from "@/components/admin/account-status-badge";
import { CompactAuditList } from "@/components/admin/audit-list";

type PageProps = { params: Promise<{ id: string }> };

const TOUR = {
  finished: "Finished",
  skipped: "Skipped",
  not_yet: "Not yet",
} as const;

/**
 * One account (Admin Center & Feedback design doc Screen 5; spec R21):
 * metadata, access, and the account's recent admin actions. By rule there is
 * nothing about the account's training here — no plan, workouts, gyms,
 * goals, records, or a link into the lifter's screens — and no impersonation.
 * An unknown or malformed id is the ordinary not-found page.
 */
export default async function AdminAccountPage({ params }: PageProps) {
  const actor = await requireAdmin();
  const { id } = await params;
  const account = await getAdminAccount(actor, id);
  if (!account) notFound();

  const name = personName(account);
  const label = name ?? account.email ?? "this account";
  const facts: [string, React.ReactNode][] = [
    [
      "Status",
      account.status === "suspended"
        ? account.suspendedSince
          ? `Suspended since ${fullDate(account.suspendedSince)}`
          : "Suspended"
        : "Active",
    ],
    ["Joined", fullDate(account.signupOn)],
    [
      "Last seen",
      account.lastActiveOn ? fullDate(account.lastActiveOn) : "Not seen",
    ],
    ["Tour", TOUR[account.tour]],
    ["Time zone", account.timeZone],
    [
      "Feedback sent",
      account.feedbackCount > 0 ? (
        <>
          {account.feedbackCount} ·{" "}
          <Link
            href={`/admin/feedback?view=all&account=${account.id}`}
            className="text-primary underline-offset-4 hover:underline"
          >
            View in inbox
          </Link>
        </>
      ) : (
        "None"
      ),
    ],
  ];

  return (
    <section className="max-w-2xl space-y-6">
      <Link
        href="/admin/accounts"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft aria-hidden className="size-4" />
        Accounts
      </Link>

      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold">
            {name ?? <span className="text-muted-foreground">No name</span>}
          </h1>
          {account.status === "suspended" ? (
            <AccountStatusBadge status="suspended" />
          ) : null}
          {account.isAdmin ? <AdminBadge /> : null}
        </div>
        <p className="text-sm text-muted-foreground">
          {account.username ? `@${account.username}` : "no username"} ·{" "}
          {account.email ?? "—"}
        </p>
      </header>

      <dl className="divide-y divide-border rounded-lg border border-border bg-card text-sm tabular-nums">
        {facts.map(([k, v]) => (
          <div
            key={k}
            className="grid grid-cols-[7.5rem_1fr] gap-2 px-3 py-2.5"
          >
            <dt className="text-muted-foreground">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>

      <AccessSection
        target={{
          id: account.id,
          label,
          email: account.email,
          status: account.status,
          isAdmin: account.isAdmin,
        }}
      />

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Admin actions</h2>
        <CompactAuditList lines={account.audit} timeZone={actor.timeZone} />
        {account.audit.length > 0 ? (
          <Link
            href={`/admin/audit?account=${account.id}`}
            className="inline-flex items-center gap-1 text-sm text-primary"
          >
            View full audit log <ChevronRight aria-hidden className="size-4" />
          </Link>
        ) : null}
      </section>
    </section>
  );
}
