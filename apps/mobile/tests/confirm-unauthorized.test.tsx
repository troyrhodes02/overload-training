/**
 * OVE-255 #2: a `/me` 401 after a good refresh shows "finish on the web"
 * only when a second look, after the web deletion's identity-removal window,
 * still refuses the account.
 */
import { act, renderHook } from "@testing-library/react-native";
import { ApiError } from "../src/api/errors";
import { decideGate } from "../src/app-state/gate";
import {
  FINISH_ON_WEB_NOTICE,
  setSignedOutNotice,
  useSignedOutNotice,
} from "../src/accounts/signed-out-notice";
import {
  afterSecondLook,
  CONFIRM_UNAUTHORIZED_MS,
  secondLookOf,
} from "../src/accounts/unauthorized-confirm";
import { useConfirmUnauthorized } from "../src/accounts/use-confirm-unauthorized";
import { appConfig, meDto } from "./harness";

const refused = {
  status: "error",
  error: new ApiError("unauthorized", "x", 401),
};
const signedOut = { status: "error", error: new ApiError("signed_out", "x") };
const offline = { status: "error", error: new ApiError("network", "x") };
const answered = { status: "success", error: null };

describe("the second look (pure)", () => {
  it("waits longer than the deletion's identity removal (about 750 ms)", () => {
    expect(CONFIRM_UNAUTHORIZED_MS).toBeGreaterThanOrEqual(1500);
  });

  it("reads the refetch", () => {
    expect(secondLookOf(refused)).toBe("unauthorized");
    expect(secondLookOf(signedOut)).toBe("signed_out");
    expect(secondLookOf(offline)).toBe("other");
    expect(secondLookOf(answered)).toBe("ok");
  });

  it("only a refusal that persists is a half-closed account", () => {
    expect(afterSecondLook("unauthorized")).toEqual({
      forget: true,
      notice: true,
    });
    expect(afterSecondLook("signed_out")).toEqual({
      forget: true,
      notice: false,
    });
    expect(afterSecondLook("ok")).toEqual({ forget: false, notice: false });
    expect(afterSecondLook("other")).toEqual({ forget: false, notice: false });
  });
});

describe("useConfirmUnauthorized", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    setSignedOutNotice(null);
  });
  afterEach(() => jest.useRealTimers());

  async function run(
    code: "unauthorized" | "signed_out" | undefined,
    second: { status: string; error: ApiError | null },
  ) {
    const refetch = jest.fn(async () => second);
    const forget = jest.fn();
    const notice = await renderHook(() => {
      useConfirmUnauthorized({ code, refetch, forget });
      return useSignedOutNotice();
    });
    return { refetch, forget, notice };
  }

  it("a refusal that persists: the notice, then sign-out", async () => {
    const { refetch, forget, notice } = await run("unauthorized", refused);
    expect(refetch).not.toHaveBeenCalled();
    expect(forget).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(CONFIRM_UNAUTHORIZED_MS);
    });
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(forget).toHaveBeenCalledTimes(1);
    expect(notice.result.current).toBe(FINISH_ON_WEB_NOTICE);
  });

  it("mid-deletion on the web: the identity is gone a moment later, so a quiet sign-out", async () => {
    const { forget, notice } = await run("unauthorized", signedOut);
    await act(async () => {
      jest.advanceTimersByTime(CONFIRM_UNAUTHORIZED_MS);
    });
    expect(forget).toHaveBeenCalledTimes(1);
    expect(notice.result.current).toBeNull();
  });

  it("the account answers on the second look: nothing happens", async () => {
    const { forget, notice } = await run("unauthorized", answered);
    await act(async () => {
      jest.advanceTimersByTime(CONFIRM_UNAUTHORIZED_MS);
    });
    expect(forget).not.toHaveBeenCalled();
    expect(notice.result.current).toBeNull();
  });

  it("no connection on the second look: decides nothing", async () => {
    const { forget, notice } = await run("unauthorized", offline);
    await act(async () => {
      jest.advanceTimersByTime(CONFIRM_UNAUTHORIZED_MS);
    });
    expect(forget).not.toHaveBeenCalled();
    expect(notice.result.current).toBeNull();
  });

  it("signed_out is forgotten at once, with no notice and no second look", async () => {
    const { refetch, forget, notice } = await run("signed_out", answered);
    expect(forget).toHaveBeenCalledTimes(1);
    expect(refetch).not.toHaveBeenCalled();
    expect(notice.result.current).toBeNull();
  });
});

describe("the confirmation is cancelled or inconclusive", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    setSignedOutNotice(null);
  });
  afterEach(() => jest.useRealTimers());

  it("a different answer before the timer fires cancels the second look", async () => {
    const refetch = jest.fn(async () => refused);
    const forget = jest.fn();
    let code: "unauthorized" | undefined = "unauthorized";
    const view = await renderHook(() =>
      useConfirmUnauthorized({ code, refetch, forget }),
    );
    code = undefined;
    await view.rerender({});
    await act(async () => {
      jest.advanceTimersByTime(CONFIRM_UNAUTHORIZED_MS);
    });
    expect(refetch).not.toHaveBeenCalled();
    expect(forget).not.toHaveBeenCalled();
  });

  it("leaving before the timer fires does nothing", async () => {
    const refetch = jest.fn(async () => refused);
    const forget = jest.fn();
    const view = await renderHook(() =>
      useConfirmUnauthorized({ code: "unauthorized", refetch, forget }),
    );
    await view.unmount();
    await act(async () => {
      jest.advanceTimersByTime(CONFIRM_UNAUTHORIZED_MS);
    });
    expect(refetch).not.toHaveBeenCalled();
  });

  it("a cached answer (a cancelled refetch) is not a second look", async () => {
    const forget = jest.fn();
    const stale = { ...refused, errorUpdatedAt: 1000 };
    const notice = await renderHook(() => {
      useConfirmUnauthorized({
        code: "unauthorized",
        errorUpdatedAt: 1000,
        refetch: async () => stale,
        forget,
      });
      return useSignedOutNotice();
    });
    await act(async () => {
      jest.advanceTimersByTime(CONFIRM_UNAUTHORIZED_MS);
    });
    expect(forget).not.toHaveBeenCalled();
    expect(notice.result.current).toBeNull();
    // A fresh refusal is.
    expect(secondLookOf({ ...refused, errorUpdatedAt: 3000 }, 1000)).toBe(
      "unauthorized",
    );
  });

  it("a refetch that throws decides nothing", async () => {
    const forget = jest.fn();
    await renderHook(() =>
      useConfirmUnauthorized({
        code: "unauthorized",
        refetch: async () => {
          throw new Error("boom");
        },
        forget,
      }),
    );
    await act(async () => {
      jest.advanceTimersByTime(CONFIRM_UNAUTHORIZED_MS);
    });
    expect(forget).not.toHaveBeenCalled();
  });
});

describe("the gate while a refusal is confirmed", () => {
  const base = {
    envOk: true,
    config: { status: "success" as const, data: appConfig() },
    session: "present" as const,
    appVersion: "0.1.0",
    upgradeRequiredSeen: false,
  };
  it("is launching, never unreachable", () => {
    expect(
      decideGate({
        ...base,
        me: { status: "error", error: new ApiError("unauthorized", "x", 401) },
      }),
    ).toBe("launching");
    expect(
      decideGate({
        ...base,
        me: { status: "error", error: new ApiError("network", "x") },
      }),
    ).toBe("unreachable");
  });
  it("keeps the signed-in app when the account's data is already loaded", () => {
    expect(
      decideGate({
        ...base,
        me: {
          status: "error",
          error: new ApiError("unauthorized", "x", 401),
          data: meDto(),
        },
      }),
    ).toBe("signed_in");
  });
});
