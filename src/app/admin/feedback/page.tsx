import { requireAdmin } from "@/lib/data/admin/identity";
import { listFeedback, parseInboxQuery } from "@/lib/data/admin/feedback";
import { todayIso } from "@/lib/plan/calendar";
import { FeedbackInbox } from "@/components/admin/feedback-inbox";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * The feedback inbox (Admin Center & Feedback design doc Screen 7; spec
 * §10.1). View, category, account, and page are URL state; anything
 * unrecognized falls back to the defaults.
 */
export default async function AdminFeedbackPage({ searchParams }: PageProps) {
  const actor = await requireAdmin();
  const query = parseInboxQuery(await searchParams);
  const data = await listFeedback(actor, query);
  return (
    <FeedbackInbox
      data={data}
      today={todayIso(actor.timeZone)}
      timeZone={actor.timeZone}
    />
  );
}
