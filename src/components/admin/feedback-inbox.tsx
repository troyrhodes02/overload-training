import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  FEEDBACK_CATEGORY_LABEL,
  type FeedbackListDto,
  type FeedbackRowDto,
} from "@/lib/admin/types";
import { shortDate } from "@/lib/admin/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

/**
 * The feedback inbox (Admin Center & Feedback design doc Screen 7; preview
 * "7 · Feedback inbox"): Open · Handled · All, a category filter, and the
 * messages newest first. Opening one does not mark it handled. No reply box,
 * no assignee, no threads.
 */

const VIEWS = [
  { value: "open", label: "Open" },
  { value: "handled", label: "Handled" },
  { value: "all", label: "All" },
] as const;

function href(
  data: Pick<FeedbackListDto, "view" | "category" | "account">,
  over: Partial<{
    view: string;
    category: string | null;
    account: string | null;
    page: number;
  }> = {},
): string {
  const view = over.view ?? data.view;
  const category = over.category === undefined ? data.category : over.category;
  const account =
    over.account === undefined ? (data.account?.id ?? null) : over.account;
  const p = new URLSearchParams();
  if (view !== "open") p.set("view", view);
  if (category) p.set("category", category);
  if (account) p.set("account", account);
  if (over.page && over.page > 1) p.set("page", String(over.page));
  const s = p.toString();
  return `/admin/feedback${s ? `?${s}` : ""}`;
}

export function senderLabel(sender: FeedbackRowDto["sender"]): string {
  if (!sender.exists) return "Deleted account";
  return sender.name ?? `No name · ${sender.email ?? "—"}`;
}

export function FeedbackInbox({
  data,
  today,
  timeZone,
}: {
  data: FeedbackListDto;
  today: string;
  timeZone: string;
}) {
  const day = (iso: string) =>
    shortDate(
      new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(iso)),
      today,
    );
  const filtered = Boolean(data.category || data.account);

  return (
    <section className="max-w-3xl space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Feedback</h1>
        <span className="text-sm text-muted-foreground tabular-nums">
          {data.openCount} open
        </span>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <nav
          aria-label="Feedback view"
          className="inline-flex self-start rounded-md bg-muted p-1"
        >
          {VIEWS.map((v) => (
            <Link
              key={v.value}
              href={href(data, { view: v.value })}
              aria-current={v.value === data.view ? "page" : undefined}
              className={cn(
                "rounded-sm px-3 py-1.5 text-sm",
                v.value === data.view
                  ? "bg-background font-medium shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v.label}
            </Link>
          ))}
        </nav>
        <form
          action="/admin/feedback"
          method="get"
          className="flex items-center gap-2 text-sm"
        >
          {data.view !== "open" ? (
            <input type="hidden" name="view" value={data.view} />
          ) : null}
          {data.account ? (
            <input type="hidden" name="account" value={data.account.id} />
          ) : null}
          <label htmlFor="fb-category" className="text-muted-foreground">
            Category
          </label>
          <NativeSelect
            id="fb-category"
            name="category"
            defaultValue={data.category ?? ""}
          >
            <option value="">All categories</option>
            {Object.entries(FEEDBACK_CATEGORY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
          <Button type="submit" variant="outline" size="sm">
            Filter
          </Button>
        </form>
      </div>

      {data.account ? (
        <Link
          href={href(data, { account: null })}
          className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-sm"
        >
          From {data.account.label ?? "Deleted account"}
          <X aria-label="Clear the account filter" className="size-4" />
        </Link>
      ) : null}

      {data.rows.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-6 text-sm">
          {filtered ? (
            <p>
              No feedback matches this filter.{" "}
              <Link
                href={href(data, { category: null, account: null })}
                className="text-primary underline-offset-4 hover:underline"
              >
                Clear filters
              </Link>
            </p>
          ) : data.view === "open" && data.openCount === 0 ? (
            <p>Nothing open. Everything sent so far is handled.</p>
          ) : (
            <p>No feedback yet.</p>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {data.rows.map((row) => (
            <li key={row.id}>
              <Link
                href={`/admin/feedback/${row.id}`}
                className="flex min-h-16 gap-3 px-3 py-3"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground tabular-nums">
                    <Badge variant="secondary">
                      {FEEDBACK_CATEGORY_LABEL[row.category]}
                    </Badge>
                    <span>{day(row.createdAt)}</span>
                    {row.handledAt ? (
                      <span className="inline-flex items-center gap-1">
                        <Check aria-hidden className="size-3.5" />
                        Handled · {day(row.handledAt)}
                      </span>
                    ) : null}
                    <span className="hidden md:ml-auto md:inline">
                      {senderLabel(row.sender)}
                    </span>
                  </div>
                  <p
                    className={cn(
                      "line-clamp-2 text-sm break-words whitespace-pre-wrap",
                      row.handledAt && "text-muted-foreground",
                    )}
                  >
                    {row.message}
                  </p>
                  <p className="text-xs text-muted-foreground md:hidden">
                    {senderLabel(row.sender)}
                  </p>
                </div>
                <ChevronRight
                  aria-hidden
                  className="mt-1 size-4 shrink-0 text-muted-foreground"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {data.page > 1 || data.hasMore ? (
        <div className="flex justify-end gap-2">
          {data.page > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={href(data, { page: data.page - 1 })}>
                <ChevronLeft aria-hidden className="size-4" /> Newer
              </Link>
            </Button>
          ) : null}
          {data.hasMore ? (
            <Button asChild variant="outline" size="sm">
              <Link href={href(data, { page: data.page + 1 })}>
                Older <ChevronRight aria-hidden className="size-4" />
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
