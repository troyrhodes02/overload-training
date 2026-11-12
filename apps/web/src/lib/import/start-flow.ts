/**
 * Workout Plan Import & Review — the Start sequence, as a pure async function so
 * the exact ordering is testable without a DOM.
 *
 * The bug it pins: the intake component used its `sessionId` React state inside
 * the click handler. State is a snapshot, so after the first `startImport` the
 * handler still saw `null` and started a SECOND, empty session; extraction then
 * ran against that empty session ("This import isn't ready to process") while
 * the pasted text sat on the first. The session is resolved ONCE here and that
 * one id is used for every step.
 */
import type { ActionResult } from "@/lib/actions/result";

export type StartFlowActions = {
  startImport(input: {
    mode: "text" | "files";
  }): Promise<ActionResult<{ sessionId: string }>>;
  addText(input: {
    sessionId: string;
    text: string;
  }): Promise<ActionResult<{ sessionId: string }>>;
  beginExtraction(input: { sessionId: string }): Promise<ActionResult<unknown>>;
};

export type StartFlowResult =
  | { ok: true; sessionId: string }
  // `sessionId` is returned even on failure once a session exists, so the caller
  // keeps it and a retry reuses it instead of creating another.
  | { ok: false; message: string; sessionId: string | null };

export async function runStartFlow(
  input: {
    mode: "paste" | "upload";
    text: string;
    /** The session already created for this form (e.g. by uploading files). */
    sessionId: string | null;
  },
  actions: StartFlowActions,
): Promise<StartFlowResult> {
  let sessionId = input.sessionId;
  if (!sessionId) {
    const started = await actions.startImport({
      mode: input.mode === "paste" ? "text" : "files",
    });
    if (!started.ok) {
      return { ok: false, message: started.error.message, sessionId: null };
    }
    sessionId = started.data.sessionId;
  }

  if (input.mode === "paste") {
    const added = await actions.addText({ sessionId, text: input.text });
    if (!added.ok) {
      return { ok: false, message: added.error.message, sessionId };
    }
  }

  const begun = await actions.beginExtraction({ sessionId });
  if (!begun.ok) {
    return { ok: false, message: begun.error.message, sessionId };
  }
  return { ok: true, sessionId };
}
