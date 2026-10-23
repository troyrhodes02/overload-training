import { requireAccount } from "@/lib/data/account";
import { SendFeedback } from "@/components/send-feedback/send-feedback-form";

export const metadata = { title: "Send feedback · Overload" };

/**
 * Send feedback (Admin Center & Feedback design doc Screen 10; spec §10.1).
 * Every signed-in lifter, on every plan (Free; no capability check). The
 * message goes to the owner's inbox with nothing attached.
 */
export default async function FeedbackPage() {
  await requireAccount();
  return <SendFeedback />;
}
