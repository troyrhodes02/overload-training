/**
 * Pitch 21j design A8, A9 (spec §5, §13 "Mobile"): the export is the web's
 * file, shared and always deleted; deletion asks three times, maps every
 * server outcome to the web's words, never claims success before the server
 * (or the token) says so, and afterwards leaves nothing private behind.
 */
import { Alert, Share } from "react-native";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { ApiError } from "../src/api/errors";
import { ExportScreen, exportFailure } from "../src/account/ExportScreen";
import { DeleteAccountScreen } from "../src/account/DeleteAccountScreen";
import {
  ExportNotComplete,
  ExportWriteFailed,
  clearExportFiles,
  shareExport,
  writeExportFile,
} from "../src/account/export-file";
import {
  DELETE_MESSAGES,
  checkAgainView,
  deletionFailure,
} from "../src/account/deletion-model";
import {
  FINISH_ON_WEB_NOTICE,
  useSignedOutNotice,
} from "../src/accounts/signed-out-notice";
import MoreScreen from "../src/app/(tabs)/more/index";
import { Providers } from "./harness";

// An in-memory expo-file-system: what exists under the cache, by uri.
const mockFiles = new Map<string, string>();
const mockDirs = new Set<string>();
let mockWriteFails = false;
jest.mock("expo-file-system", () => {
  const join = (base: { uri: string } | string, name: string) =>
    `${typeof base === "string" ? base : base.uri}/${name}`;
  class Directory {
    uri: string;
    constructor(base: { uri: string } | string, name: string) {
      this.uri = join(base, name);
    }
    get exists() {
      return mockDirs.has(this.uri);
    }
    create() {
      mockDirs.add(this.uri);
    }
    delete() {
      mockDirs.delete(this.uri);
      for (const k of [...mockFiles.keys()])
        if (k.startsWith(`${this.uri}/`)) mockFiles.delete(k);
    }
  }
  class File {
    uri: string;
    constructor(base: { uri: string } | string, name: string) {
      this.uri = join(base, name);
    }
    create() {
      mockFiles.set(this.uri, "");
    }
    async write(text: string) {
      if (mockWriteFails) throw new Error("ENOSPC");
      mockFiles.set(this.uri, text);
    }
  }
  return {
    Directory,
    File,
    Paths: { cache: { uri: "file:///cache" } },
  };
});

const mockApi = { request: jest.fn() };
jest.mock("../src/api/ApiProvider", () => ({ useApi: () => mockApi }));
const mockSession = {
  forgetSession: jest.fn(async () => {}),
  signOut: jest.fn(),
};
jest.mock("../src/auth/session", () => ({ useSession: () => mockSession }));
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  get router() {
    return mockRouter;
  },
  useLocalSearchParams: () => ({}),
  usePathname: () => "/more",
  usePreventRemove: () => {},
  useFocusEffect: () => {},
}));

type Call = { method?: string; body?: unknown; timeoutMs?: number };
function serve(routes: Record<string, unknown>) {
  mockApi.request.mockImplementation(async (path: string, opts: Call = {}) => {
    const key = `${opts.method ?? "GET"} ${path}`;
    const r = routes[key];
    if (r === undefined) throw new ApiError("not_found", "nope", 404);
    if (r instanceof Error) throw r;
    return typeof r === "function" ? (r as (o: Call) => unknown)(opts) : r;
  });
}
const deletes = () =>
  mockApi.request.mock.calls.filter(([p]) => p === "/me/delete");

const DOC = {
  formatVersion: 1,
  exportedOn: "2026-11-24",
  profile: { firstName: "Sam" },
  loggedSets: [{ id: "s1", reps: 8 }],
};
const INVENTORY = {
  mesocycles: 2,
  loggedSessions: 86,
  loggedSets: 1240,
  goals: 3,
  gyms: 2,
  customExercises: 0,
  cardioLogs: 0,
};
const EMPTY = Object.fromEntries(
  Object.keys(INVENTORY).map((k) => [k, 0]),
) as typeof INVENTORY;

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  mockFiles.clear();
  mockDirs.clear();
  mockWriteFails = false;
});

describe("export file", () => {
  it("writes the web's file name and bytes, and shareExport always deletes it", async () => {
    let seen: { uri: string; text?: string } | null = null;
    const share = jest.fn(async ({ url }: { url?: string }) => {
      seen = { uri: url ?? "", text: mockFiles.get(url ?? "") };
      return { action: Share.sharedAction };
    });
    expect(await shareExport(DOC, { share: share as never })).toBe("shared");
    expect(seen).toEqual({
      uri: "file:///cache/exports/overload-export-2026-11-24.json",
      text: JSON.stringify(DOC, null, 2),
    });
    expect(mockFiles.size).toBe(0);
  });

  it("a dismissed sheet is not an error, and a failed sheet still deletes", async () => {
    const dismissed = jest.fn(async () => ({
      action: Share.dismissedAction,
    }));
    expect(await shareExport(DOC, { share: dismissed as never })).toBe(
      "dismissed",
    );
    const fails = jest.fn(async () => {
      throw new Error("sheet");
    });
    await expect(shareExport(DOC, { share: fails as never })).rejects.toThrow(
      "sheet",
    );
    expect(mockFiles.size).toBe(0);
  });

  it("refuses an incomplete answer before writing; a full disk leaves nothing", async () => {
    await expect(writeExportFile({ partial: true })).rejects.toBeInstanceOf(
      ExportNotComplete,
    );
    expect(mockFiles.size).toBe(0);
    mockWriteFails = true;
    await expect(writeExportFile(DOC)).rejects.toBeInstanceOf(
      ExportWriteFailed,
    );
    expect(mockFiles.size).toBe(0);
  });

  it("clearing removes a leftover from an interrupted export", () => {
    mockDirs.add("file:///cache/exports");
    mockFiles.set(
      "file:///cache/exports/overload-export-2026-11-01.json",
      "{}",
    );
    clearExportFiles();
    expect(mockFiles.size).toBe(0);
  });

  it("failure words: disk, connection, server", () => {
    expect(exportFailure(new ExportWriteFailed())).toMatch(/enough space/);
    expect(exportFailure(new ApiError("network", "x"))).toBe(
      "Overload needs a connection to export.",
    );
    expect(exportFailure(new ApiError("internal_error", "x", 500))).toBe(
      "Couldn't prepare your export. Try again.",
    );
  });
});

describe("A8 Export your data", () => {
  it("fetches with the long timeout and hands the document to the share step", async () => {
    serve({ "GET /me/export": DOC });
    const share = jest.fn(async () => "shared" as const);
    await render(
      <Providers>
        <ExportScreen share={share} />
      </Providers>,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Export" }));
    await waitFor(() => expect(share).toHaveBeenCalledWith(DOC));
    expect(mockApi.request).toHaveBeenCalledWith("/me/export", {
      timeoutMs: 60_000,
    });
  });

  it("offline says so and keeps nothing", async () => {
    serve({ "GET /me/export": new ApiError("network", "offline") });
    await render(
      <Providers>
        <ExportScreen share={jest.fn()} />
      </Providers>,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Export" }));
    expect(
      await screen.findByText("Overload needs a connection to export."),
    ).toBeTruthy();
  });
});

describe("deletion model", () => {
  it("maps every server outcome to the web's words", () => {
    const form = (e: ApiError) => deletionFailure(e);
    expect(
      form(
        new ApiError("validation_error", "x", 400, {
          password: "That password isn't right.",
        }),
      ),
    ).toEqual({
      kind: "form",
      fieldError: "That password isn't right.",
      formError: null,
    });
    expect(form(new ApiError("rate_limited", "x", 429))).toMatchObject({
      formError: DELETE_MESSAGES.rateLimited,
    });
    expect(
      form(
        new ApiError("conflict", "x", 409, { reason: "billing_not_canceled" }),
      ),
    ).toMatchObject({ formError: DELETE_MESSAGES.billing });
    expect(form(new ApiError("internal_error", "x", 500))).toMatchObject({
      formError: DELETE_MESSAGES.nothingDeleted,
    });
    for (const code of ["network", "unavailable", "signed_out"] as const) {
      expect(form(new ApiError(code, "x")).kind).toBe("unconfirmed");
    }
    expect(form(new ApiError("unauthorized", "x", 401)).kind).toBe(
      "finishOnWeb",
    );
  });

  it("Check again: gone → deleted; empty → pending; data → still here", () => {
    expect(checkAgainView({ kind: "gone" })).toEqual({ kind: "deleted" });
    expect(checkAgainView({ kind: "present", inventory: EMPTY })).toMatchObject(
      {
        formError: DELETE_MESSAGES.identityPending,
      },
    );
    expect(
      checkAgainView({ kind: "present", inventory: INVENTORY }),
    ).toMatchObject({ formError: DELETE_MESSAGES.stillHere });
    expect(checkAgainView({ kind: "unreachable" }).kind).toBe("unconfirmed");
    expect(checkAgainView({ kind: "halfClosed" })).toEqual({
      kind: "finishOnWeb",
    });
  });
});

describe("A9 Delete account", () => {
  const confirmAlert = (choice: "Cancel" | "Delete") =>
    jest
      .spyOn(Alert, "alert")
      .mockImplementation((_t, _m, buttons) =>
        buttons?.find((b) => b.text === choice)?.onPress?.(),
      );

  async function open(routes: Record<string, unknown>) {
    serve({ "GET /me/deletion-inventory": INVENTORY, ...routes });
    await render(
      <Providers>
        <DeleteAccountScreen />
      </Providers>,
    );
    await screen.findByText("Logged sets");
  }

  it("shows the inventory and the billing note; the button waits for a password", async () => {
    await open({});
    expect(screen.getByText("1,240")).toBeTruthy();
    expect(screen.queryByText("Custom exercises")).toBeNull();
    expect(
      screen.getByText(/canceled immediately and you won't be charged again/),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Delete account permanently" }).props
        .accessibilityState.disabled,
    ).toBe(true);
  });

  it("Cancel at the alert sends nothing", async () => {
    const alert = confirmAlert("Cancel");
    await open({});
    await fireEvent.changeText(screen.getByLabelText("Password"), "pw");
    await fireEvent.press(
      screen.getByRole("button", { name: "Delete account permanently" }),
    );
    expect(alert).toHaveBeenCalledWith(
      "Delete your Overload account?",
      expect.any(String),
      expect.any(Array),
    );
    expect(deletes()).toHaveLength(0);
    expect(mockSession.forgetSession).not.toHaveBeenCalled();
  });

  it("deleted: the session is forgotten, files cleared, and Welcome will say so", async () => {
    confirmAlert("Delete");
    mockDirs.add("file:///cache/exports");
    mockFiles.set("file:///cache/exports/old.json", "{}");
    await open({ "POST /me/delete": { outcome: "deleted" } });
    await fireEvent.changeText(screen.getByLabelText("Password"), "pw");
    await fireEvent.press(
      screen.getByRole("button", { name: "Delete account permanently" }),
    );
    await waitFor(() => expect(mockSession.forgetSession).toHaveBeenCalled());
    expect(deletes()[0][1]).toEqual({
      method: "POST",
      body: { password: "pw" },
      timeoutMs: 60_000,
    });
    expect(mockFiles.size).toBe(0);
    let notice: string | null = null;
    function Probe() {
      notice = useSignedOutNotice();
      return null;
    }
    await render(<Probe />);
    expect(notice).toBe("Your account was deleted.");
  });

  it("a wrong password stays on the field and clears it; nothing is forgotten", async () => {
    confirmAlert("Delete");
    await open({
      "POST /me/delete": new ApiError("validation_error", "x", 400, {
        password: "That password isn't right.",
      }),
    });
    await fireEvent.changeText(screen.getByLabelText("Password"), "nope");
    await fireEvent.press(
      screen.getByRole("button", { name: "Delete account permanently" }),
    );
    expect(await screen.findByText("That password isn't right.")).toBeTruthy();
    expect(screen.getByLabelText("Password").props.value).toBe("");
    expect(mockSession.forgetSession).not.toHaveBeenCalled();
  });

  it("billing not canceled: says nothing was deleted", async () => {
    confirmAlert("Delete");
    await open({
      "POST /me/delete": new ApiError("conflict", "x", 409, {
        reason: "billing_not_canceled",
      }),
    });
    await fireEvent.changeText(screen.getByLabelText("Password"), "pw");
    await fireEvent.press(
      screen.getByRole("button", { name: "Delete account permanently" }),
    );
    expect(await screen.findByText(DELETE_MESSAGES.billing)).toBeTruthy();
    expect(mockSession.forgetSession).not.toHaveBeenCalled();
  });

  it("identity pending: never 'deleted' — signs out and says to finish on the website (review #1)", async () => {
    confirmAlert("Delete");
    await open({ "POST /me/delete": { outcome: "identity_pending" } });
    await fireEvent.changeText(screen.getByLabelText("Password"), "pw");
    await fireEvent.press(
      screen.getByRole("button", { name: "Delete account permanently" }),
    );
    await waitFor(() => expect(mockSession.forgetSession).toHaveBeenCalled());
    let notice: string | null = null;
    function Probe() {
      notice = useSignedOutNotice();
      return null;
    }
    await render(<Probe />);
    expect(notice).toBe(FINISH_ON_WEB_NOTICE);
  });

  it("a 401 after a good refresh (half closed) is never read as deleted", async () => {
    confirmAlert("Delete");
    await open({
      "POST /me/delete": new ApiError("network", "timeout"),
      "GET /me": new ApiError("unauthorized", "no account", 401),
    });
    await fireEvent.changeText(screen.getByLabelText("Password"), "pw");
    await fireEvent.press(
      screen.getByRole("button", { name: "Delete account permanently" }),
    );
    await fireEvent.press(
      await screen.findByRole("button", { name: "Check again" }),
    );
    await waitFor(() => expect(mockSession.forgetSession).toHaveBeenCalled());
    let notice: string | null = null;
    function Probe() {
      notice = useSignedOutNotice();
      return null;
    }
    await render(<Probe />);
    expect(notice).toBe(FINISH_ON_WEB_NOTICE);
  });

  it("no answer: unconfirmed; Check again finds the account gone and finishes", async () => {
    confirmAlert("Delete");
    await open({
      "POST /me/delete": new ApiError("network", "timeout"),
      "GET /me": new ApiError("signed_out", "gone"),
    });
    await fireEvent.changeText(screen.getByLabelText("Password"), "pw");
    await fireEvent.press(
      screen.getByRole("button", { name: "Delete account permanently" }),
    );
    expect(await screen.findByText(DELETE_MESSAGES.unconfirmed)).toBeTruthy();
    expect(mockSession.forgetSession).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Check again" }));
    await waitFor(() => expect(mockSession.forgetSession).toHaveBeenCalled());
  });

  it("Check again with the account still there says nothing was deleted", async () => {
    confirmAlert("Delete");
    await open({
      "POST /me/delete": new ApiError("unavailable", "502"),
      "GET /me": {},
    });
    await fireEvent.changeText(screen.getByLabelText("Password"), "pw");
    await fireEvent.press(
      screen.getByRole("button", { name: "Delete account permanently" }),
    );
    await fireEvent.press(
      await screen.findByRole("button", { name: "Check again" }),
    );
    expect(await screen.findByText(DELETE_MESSAGES.stillHere)).toBeTruthy();
    expect(mockSession.forgetSession).not.toHaveBeenCalled();
  });
});

describe("M1 More (21j final)", () => {
  it("has Export and Delete account, and no web account link", async () => {
    serve({});
    await render(
      <Providers>
        <MoreScreen />
      </Providers>,
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Export your data" }),
    );
    expect(mockRouter.push).toHaveBeenLastCalledWith("/more/export");
    await fireEvent.press(
      screen.getByRole("button", { name: "Delete account" }),
    );
    expect(mockRouter.push).toHaveBeenLastCalledWith("/more/delete-account");
    expect(screen.queryByText("Manage account on the web")).toBeNull();
    await act(async () => {});
  });
});
