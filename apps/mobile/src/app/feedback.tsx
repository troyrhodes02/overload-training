import { FeedbackScreen } from "../account/FeedbackScreen";

/**
 * A6 Send feedback (Pitch 21j design §6 A6): a root modal, so More and Get
 * help open one form (`?category=question` from Get help).
 */
export default function FeedbackRoute() {
  return <FeedbackScreen />;
}
