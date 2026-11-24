import { FeedbackScreen } from "../account/FeedbackScreen";
import { ScreenshotAttachment } from "../account/ScreenshotAttachment";

/**
 * A6 Send feedback (Pitch 21j design §6 A6): a root modal, so More and Get
 * help open one form (`?category=question` from Get help).
 */
export default function FeedbackRoute() {
  // OVE-252 (RD-9): the screenshot row needs the image picker in the
  // installed build (a new native runtime).
  return <FeedbackScreen attachment={<ScreenshotAttachment />} />;
}
