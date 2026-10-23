import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireAdmin } from "@/lib/data/admin/identity";
import { getFeedbackItem } from "@/lib/data/admin/feedback";
import { FEEDBACK_CATEGORY_LABEL } from "@/lib/admin/types";
import { instantDate, instantLabel } from "@/lib/admin/format";
import { Badge } from "@/components/ui/badge";
import { CompactAuditList } from "@/components/admin/audit-list";
import {
  FeedbackCategoryControl,
  FeedbackHandledControl,
} from "@/components/admin/feedback-item-controls";

type PageProps = { params: Promise<{ id: string }> };

/**
 * One feedback message (Admin Center & Feedback design doc Screen 8; spec
 * R20): the lifter's words exactly as sent (plain text, never HTML), the
 * sender's account metadata, and the two controls. Nothing about the
 * sender's training is fetched or attached. An unknown id is not-found.
 */
export default async function AdminFeedbackItemPage({ params }: PageProps) {
  const actor = await requireAdmin();
  const { id } = await params;
  const item = await getFeedbackItem(actor, id);
  if (!item) notFound();

  const lastHandled = item.history.find((l) => l.kind === "feedback_handled");
  const handledLine =
    item.handledAt && lastHandled
      ? `Handled ${instantDate(item.handledAt, actor.timeZone)} by ${lastHandled.actorName}`
      : null;

  return (
    <section className="max-w-2xl space-y-5">
      <Link
        href="/admin/feedback"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft aria-hidden className="size-4" />
        Feedback
      </Link>
      <h1 className="sr-only">Feedback</h1>
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground tabular-nums">
        <Badge variant="secondary">
          {FEEDBACK_CATEGORY_LABEL[item.category]}
        </Badge>
        Sent {instantLabel(item.createdAt, actor.timeZone)}
      </div>
      <p className="rounded-lg border border-border bg-card p-4 text-sm break-words whitespace-pre-wrap">
        {item.message}
      </p>

      <dl className="space-y-3 text-sm">
        <div className="grid grid-cols-[5.5rem_1fr] gap-2">
          <dt className="text-muted-foreground">From</dt>
          <dd className="space-y-0.5">
            {item.sender.exists ? (
              <>
                <div>
                  {item.sender.name ?? (
                    <span className="text-muted-foreground">No name</span>
                  )}
                </div>
                <div className="text-muted-foreground">
                  {item.sender.username
                    ? `@${item.sender.username}`
                    : "no username"}{" "}
                  · {item.sender.email ?? "—"}
                </div>
                <Link
                  href={`/admin/accounts/${item.sender.id}`}
                  className="inline-flex items-center gap-1 text-primary"
                >
                  View account <ChevronRight aria-hidden className="size-4" />
                </Link>
              </>
            ) : (
              <span className="text-muted-foreground">Deleted account</span>
            )}
          </dd>
        </div>
        <div className="grid grid-cols-[5.5rem_1fr] items-start gap-2">
          <dt className="pt-2 text-muted-foreground">Category</dt>
          <dd>
            <FeedbackCategoryControl
              key={item.category}
              feedbackId={item.id}
              category={item.category}
            />
          </dd>
        </div>
      </dl>

      <FeedbackHandledControl
        feedbackId={item.id}
        handled={item.handledAt !== null}
        handledLine={handledLine}
      />

      <section className="space-y-2">
        <h2 className="text-base font-semibold">History</h2>
        <CompactAuditList
          lines={item.history}
          timeZone={actor.timeZone}
          empty="No admin changes yet."
        />
        <p className="grid grid-cols-[8.5rem_1fr] gap-2 border-t border-border py-2 text-sm tabular-nums">
          <span className="text-muted-foreground">
            {instantLabel(item.createdAt, actor.timeZone, false)}
          </span>
          <span>Sent</span>
        </p>
      </section>
    </section>
  );
}
