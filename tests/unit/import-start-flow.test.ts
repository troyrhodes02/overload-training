import type { ActionResult } from "@/lib/actions/result";
import { runStartFlow, type StartFlowActions } from "@/lib/import/start-flow";

const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data });
const fail = (message: string): ActionResult<never> => ({
  ok: false,
  error: { code: "internal_error", message },
});

/** Fake server: tracks sessions and which one holds the text. */
function fakeServer(opts: { failBegin?: boolean } = {}) {
  const sessions: { id: string; text: string | null; status: string }[] = [];
  const actions: StartFlowActions = {
    startImport: jest.fn(async () => {
      const id = `s${sessions.length + 1}`;
      sessions.push({ id, text: null, status: "created" });
      return ok({ sessionId: id });
    }),
    addText: jest.fn(async ({ sessionId, text }) => {
      const s = sessions.find((x) => x.id === sessionId)!;
      s.text = text;
      s.status = "uploaded";
      return ok({ sessionId });
    }),
    beginExtraction: jest.fn(async ({ sessionId }) => {
      const s = sessions.find((x) => x.id === sessionId)!;
      if (opts.failBegin) return fail("boom");
      // Mirrors beginExtraction: only an `uploaded` session may start.
      if (s.status !== "uploaded")
        return fail("This import isn't ready to process.");
      return ok({});
    }),
  };
  return { sessions, actions };
}

describe("runStartFlow — pasted text (first click)", () => {
  it("creates exactly ONE session and extracts the one holding the text", async () => {
    const { sessions, actions } = fakeServer();
    const result = await runStartFlow(
      { mode: "paste", text: "Push day...", sessionId: null },
      actions,
    );
    expect(result).toEqual({ ok: true, sessionId: "s1" });
    expect(actions.startImport).toHaveBeenCalledTimes(1);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      text: "Push day...",
      status: "uploaded",
    });
    // text added and extraction begun on the SAME session
    expect(actions.addText).toHaveBeenCalledWith({
      sessionId: "s1",
      text: "Push day...",
    });
    expect(actions.beginExtraction).toHaveBeenCalledWith({ sessionId: "s1" });
  });

  it("reuses an existing session instead of creating another", async () => {
    const { sessions, actions } = fakeServer();
    sessions.push({ id: "s1", text: null, status: "created" });
    const result = await runStartFlow(
      { mode: "paste", text: "x", sessionId: "s1" },
      actions,
    );
    expect(result.ok).toBe(true);
    expect(actions.startImport).not.toHaveBeenCalled();
  });

  it("keeps the session id on failure so a retry does not create a second one", async () => {
    const { sessions, actions } = fakeServer({ failBegin: true });
    const first = await runStartFlow(
      { mode: "paste", text: "x", sessionId: null },
      actions,
    );
    expect(first).toMatchObject({ ok: false, sessionId: "s1" });
    const retry = await runStartFlow(
      { mode: "paste", text: "x", sessionId: first.sessionId },
      actions,
    );
    expect(retry).toMatchObject({ ok: false, sessionId: "s1" });
    expect(sessions).toHaveLength(1);
  });

  it("stops at the first failure and returns its message", async () => {
    const { actions } = fakeServer();
    (actions.addText as jest.Mock).mockResolvedValueOnce(
      fail("Paste your plan to continue."),
    );
    const result = await runStartFlow(
      { mode: "paste", text: "", sessionId: null },
      actions,
    );
    expect(result).toEqual({
      ok: false,
      message: "Paste your plan to continue.",
      sessionId: "s1",
    });
    expect(actions.beginExtraction).not.toHaveBeenCalled();
  });
});

describe("runStartFlow — uploaded files", () => {
  it("does not add text and begins on the upload session", async () => {
    const { sessions, actions } = fakeServer();
    sessions.push({ id: "s1", text: null, status: "uploaded" });
    const result = await runStartFlow(
      { mode: "upload", text: "", sessionId: "s1" },
      actions,
    );
    expect(result).toEqual({ ok: true, sessionId: "s1" });
    expect(actions.addText).not.toHaveBeenCalled();
    expect(actions.startImport).not.toHaveBeenCalled();
  });
});
