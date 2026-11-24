import { FeedbackScreen } from "../account/FeedbackScreen";
import { loadScreenshotAttachment } from "../account/native-picker";

// OVE-252 (RD-9; review #5): the Screenshot row only on a build that has the
// native image picker; otherwise the form sends text only.
const Attachment = loadScreenshotAttachment();

/**
 * A6 Send feedback (Pitch 21j design §6 A6): a root modal, so More and Get
 * help open one form (`?category=question` from Get help).
 */
export default function FeedbackRoute() {
  return (
    <FeedbackScreen attachment={Attachment ? <Attachment /> : undefined} />
  );
}
