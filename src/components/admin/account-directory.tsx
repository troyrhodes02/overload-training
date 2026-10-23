import Link from "next/link";
import { ChevronLeft, ChevronRight, Search, TriangleAlert } from "lucide-react";
import type {
  AdminAccountListDto,
  AdminAccountRowDto,
} from "@/lib/admin/types";
import { personName } from "@/lib/admin/types";
import { shortDate } from "@/lib/admin/format";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AccountStatusBadge, AdminBadge } from "./account-status-badge";

/**
 * The account directory (Admin Center & Feedback design doc Screen 4;
 * preview "4 · Accounts"): search and status filter as URL state, stacked
 * rows on a phone and a table from md. Metadata only — and no plan column
 * until Plans, Billing & Promo Codes adds one.
 */

const TOUR: Record<AdminAccountRowDto["tour"], string> = {
  finished: "Finished",
  skipped: "Skipped",
  not_yet: "Not yet",
};

const STATUSES = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
] as const;

function href(q: string, status: string, page = 1): string {
  const p = new URLSearchParams();
  if (q) p.set("q", q);
  if (status !== "all") p.set("status", status);
  if (page > 1) p.set("page", String(page));
  const s = p.toString();
  return `/admin/accounts${s ? `?${s}` : ""}`;
}

function NameLine({ row }: { row: AdminAccountRowDto }) {
  const name = personName(row);
  return (
    <span className="inline-flex flex-wrap items-center gap-2 font-medium">
      {name ?? <span className="text-muted-foreground">No name</span>}
      {row.isAdmin ? <AdminBadge /> : null}
    </span>
  );
}

function subLine(row: AdminAccountRowDto): string {
  return `${row.username ? `@${row.username}` : "no username"} · ${row.email ?? "—"}`;
}

function seen(row: AdminAccountRowDto, today: string): string {
  return row.lastActiveOn ? shortDate(row.lastActiveOn, today) : "Not seen";
}

export function AccountDirectory({
  data,
  q,
  status,
  today,
}: {
  data: AdminAccountListDto;
  q: string;
  status: "all" | "active" | "suspended";
  today: string;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Accounts</h1>
        <span className="text-sm text-muted-foreground tabular-nums">
          {data.total} {data.total === 1 ? "account" : "accounts"}
        </span>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <form
          action="/admin/accounts"
          method="get"
          role="search"
          className="relative flex-1"
        >
          {status !== "all" ? (
            <input type="hidden" name="status" value={status} />
          ) : null}
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            name="q"
            defaultValue={q}
            aria-label="Search accounts"
            placeholder="Search name, username, email"
            className="h-11 pl-9"
          />
        </form>
        <nav
          aria-label="Status"
          className="inline-flex self-start rounded-md bg-muted p-1"
        >
          {STATUSES.map((s) => (
            <Link
              key={s.value}
              href={href(q, s.value)}
              aria-current={s.value === status ? "page" : undefined}
              className={cn(
                "rounded-sm px-3 py-1.5 text-sm",
                s.value === status
                  ? "bg-background font-medium shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s.label}
            </Link>
          ))}
        </nav>
      </div>

      {!data.emailsAvailable ? (
        <Alert>
          <TriangleAlert aria-hidden className="size-4" />
          <AlertDescription>
            Emails couldn&apos;t be loaded right now. Search by name or username
            still works.
          </AlertDescription>
        </Alert>
      ) : null}

      {data.rows.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-6 text-sm">
          {q ? (
            <p>
              No accounts match &ldquo;{q}&rdquo;.{" "}
              <Link
                href={href("", status)}
                className="text-primary underline-offset-4 hover:underline"
              >
                Clear search
              </Link>
            </p>
          ) : status === "suspended" ? (
            <p>No suspended accounts.</p>
          ) : (
            <p>No accounts yet.</p>
          )}
        </div>
      ) : (
        <>
          {/* Phone: stacked rows. */}
          <ul className="divide-y divide-border rounded-lg border border-border bg-card md:hidden">
            {data.rows.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/admin/accounts/${row.id}`}
                  className="flex min-h-16 items-center gap-3 px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <NameLine row={row} />
                    <div className="truncate text-xs text-muted-foreground">
                      {subLine(row)}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground tabular-nums">
                      <AccountStatusBadge status={row.status} /> · Joined{" "}
                      {shortDate(row.signupOn, today)} ·{" "}
                      {row.lastActiveOn
                        ? `Seen ${seen(row, today).replace("Today", "today")}`
                        : "Not seen"}
                    </div>
                  </div>
                  <ChevronRight
                    aria-hidden
                    className="size-4 text-muted-foreground"
                  />
                </Link>
              </li>
            ))}
          </ul>
          {/* md+: a table. */}
          <div className="hidden overflow-hidden rounded-lg border border-border bg-card md:block">
            <table className="w-full text-sm">
              <caption className="sr-only">Accounts</caption>
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  {["Account", "Status", "Joined", "Last seen", "Tour"].map(
                    (h) => (
                      <th key={h} scope="col" className="px-3 py-2 font-medium">
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {data.rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-border last:border-0 hover:bg-accent/50"
                  >
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/admin/accounts/${row.id}`}
                        className="text-primary"
                      >
                        <NameLine row={row} />
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {subLine(row)}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <AccountStatusBadge status={row.status} />
                    </td>
                    <td className="px-3 py-2.5">
                      {shortDate(row.signupOn, today)}
                    </td>
                    <td className="px-3 py-2.5">{seen(row, today)}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {TOUR[row.tour]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {data.pageCount > 1 ? (
        <div className="flex justify-end gap-2">
          {data.page > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={href(q, status, data.page - 1)}>
                <ChevronLeft aria-hidden className="size-4" /> Previous
              </Link>
            </Button>
          ) : null}
          {data.page < data.pageCount ? (
            <Button asChild variant="outline" size="sm">
              <Link href={href(q, status, data.page + 1)}>
                Next <ChevronRight aria-hidden className="size-4" />
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
