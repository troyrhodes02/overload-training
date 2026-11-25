import { clearExportFiles } from "../account/export-file";
import { resetFeedbackDraft } from "../account/feedback-model";
import {
  ACCOUNT_DELETED_NOTICE,
  setSignedOutNotice,
} from "./signed-out-notice";

/**
 * After the server confirms the account is gone (Pitch 21j spec §7; RD-19):
 * nothing private stays on the phone. `forgetSession` drops the auth session
 * locally (the identity is already gone server-side, so no network), which
 * signs the shell out and runs `clearAccountQueries` — every cached screen,
 * notice, Pro-note, and the feedback draft. The export folder is emptied too.
 * The appearance mirror is kept: a device preference, not account data.
 */
export async function afterAccountDeleted(
  session: { forgetSession: () => Promise<void> },
  notice: string = ACCOUNT_DELETED_NOTICE,
): Promise<void> {
  setSignedOutNotice(notice);
  resetFeedbackDraft();
  clearExportFiles();
  await session.forgetSession();
}
