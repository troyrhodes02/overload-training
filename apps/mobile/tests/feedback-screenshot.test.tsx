/**
 * Pitch 21j design A6 (OVE-252; RD-9, RD-10): one screenshot the lifter
 * chooses, reviewed, replaced, or removed, prepared as a small JPEG, and sent
 * as the multipart file part with the message.
 */
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { ApiError } from "../src/api/errors";
import { FeedbackScreen } from "../src/account/FeedbackScreen";
import { ScreenshotAttachment } from "../src/account/ScreenshotAttachment";
import {
  resetFeedbackDraft,
  updateFeedbackDraft,
  useFeedbackDraft,
} from "../src/account/feedback-model";
import { fitsUpload, resizeFor } from "../src/account/screenshot-model";
import { Providers } from "./harness";

jest.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: jest.fn(),
  getMediaLibraryPermissionsAsync: jest.fn(),
}));
jest.mock("expo-image-manipulator", () => ({
  ImageManipulator: { manipulate: jest.fn() },
  SaveFormat: { JPEG: "jpeg" },
}));
const mockDeleted: string[] = [];
jest.mock("expo-file-system", () => ({
  File: class {
    uri: string;
    size = 1000;
    exists = true;
    constructor(uri: string) {
      this.uri = uri;
    }
    delete() {
      mockDeleted.push(this.uri);
    }
    async bytes() {
      return mockJpeg;
    }
  },
}));
// A JPEG's first bytes (SOI + APP0), enough for the server's sniffing.
const mockJpeg = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70,
]);
const mockApi = { request: jest.fn() };
jest.mock("../src/api/ApiProvider", () => ({ useApi: () => mockApi }));
const mockRouter = { push: jest.fn(), back: jest.fn() };
jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  get router() {
    return mockRouter;
  },
  useLocalSearchParams: () => ({}),
}));

// On the phone the global FormData is React Native's, which takes a file part
// as { uri, name, type }; Jest's would stringify it.
const RNFormData = jest.requireActual(
  "react-native/Libraries/Network/FormData",
).default;
const realFormData = global.FormData;
beforeAll(() => {
  global.FormData = RNFormData;
});
afterAll(() => {
  global.FormData = realFormData;
});

const SHOT = {
  uri: "file:///cache/manip/1.jpg",
  name: "screenshot.jpg",
  type: "image/jpeg",
};

beforeEach(() => {
  jest.clearAllMocks();
  resetFeedbackDraft();
  mockDeleted.length = 0;
});

describe("screenshot model", () => {
  it("resizes only past 2,048 px, on the longest side", () => {
    expect(resizeFor(1179, 2556)).toEqual({ height: 2048 });
    expect(resizeFor(4032, 3024)).toEqual({ width: 2048 });
    expect(resizeFor(1000, 2000)).toBeNull();
  });
  it("refuses a prepared file over the server's 3 MB limit", () => {
    expect(fitsUpload(3_000_000)).toBe(true);
    expect(fitsUpload(3_000_001)).toBe(false);
    expect(fitsUpload(null)).toBe(true);
  });
});

describe("A6 screenshot row", () => {
  it("add → attached with Replace and Remove; Remove clears it", async () => {
    const pick = jest.fn(async () => SHOT);
    await render(
      <Providers>
        <ScreenshotAttachment pick={pick} />
      </Providers>,
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Add a screenshot" }),
    );
    expect(await screen.findByText("Screenshot attached")).toBeTruthy();
    await fireEvent.press(
      screen.getByRole("button", { name: "Remove the screenshot" }),
    );
    expect(
      await screen.findByRole("button", { name: "Add a screenshot" }),
    ).toBeTruthy();
  });

  it("a cancelled picker changes nothing; a failure says so", async () => {
    const pick = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("failed");
    await render(
      <Providers>
        <ScreenshotAttachment pick={pick} />
      </Providers>,
    );
    const add = screen.getByRole("button", { name: "Add a screenshot" });
    await fireEvent.press(add);
    expect(screen.queryByText("Screenshot attached")).toBeNull();
    await fireEvent.press(add);
    expect(
      await screen.findByText("That image couldn't be attached. Try another."),
    ).toBeTruthy();
  });

  it("denied photo access offers Settings", async () => {
    await render(
      <Providers>
        <ScreenshotAttachment pick={jest.fn(async () => "denied" as const)} />
      </Providers>,
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Add a screenshot" }),
    );
    expect(
      await screen.findByRole("button", { name: "Open Settings" }),
    ).toBeTruthy();
  });
});

describe("A6 send with a screenshot", () => {
  it("sends the screenshot as the file part; a failed send keeps it", async () => {
    mockApi.request.mockRejectedValueOnce(new ApiError("network", "offline"));
    mockApi.request.mockResolvedValueOnce({ sent: true });
    updateFeedbackDraft({
      category: "bug",
      message: "See this",
      screenshot: SHOT,
    });
    await render(
      <Providers>
        <FeedbackScreen Attachment={ScreenshotAttachment} />
      </Providers>,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Send" }));
    expect(
      await screen.findByText("Couldn't send. Your message is still here."),
    ).toBeTruthy();
    expect(screen.getByText("Screenshot attached")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Send" }));
    await waitFor(() =>
      expect(screen.getByText("Thanks — sent to the owner.")).toBeTruthy(),
    );
    const fd = mockApi.request.mock.calls[1][1].formData as {
      getParts: () => { fieldName: string; name?: string; type?: string }[];
    };
    const parts = fd.getParts();
    expect(parts.map((p) => p.fieldName)).toEqual([
      "category",
      "message",
      "screenshots",
    ]);
    expect(parts[2]).toMatchObject({
      name: "screenshot.jpg",
      type: "image/jpeg",
    });
    // A screenshot gets the longer upload timeout.
    expect(mockApi.request.mock.calls[1][1].timeoutMs).toBe(60_000);
    // The same intent: one key across the retry.
    expect(mockApi.request.mock.calls[0][1].headers).toEqual(
      mockApi.request.mock.calls[1][1].headers,
    );
  });
});

describe("the body expo/fetch actually sends (OVE-254)", () => {
  // On the phone the global fetch is expo/fetch: Expo patches FormData at
  // startup and encodes the body with its own converter. Run exactly those.
  const { installFormDataPatch } = jest.requireActual(
    "expo/src/winter/FormData",
  );
  const { convertFormDataAsync } = jest.requireActual(
    "expo/src/winter/fetch/convertFormData",
  );
  beforeAll(() => installFormDataPatch(RNFormData));

  // The server's view: the platform multipart parser (React Native's types
  // don't describe it, hence the narrow shapes).
  type ParsedForm = { get(n: string): unknown; has(n: string): boolean };
  type ParsedFile = {
    name: string;
    type: string;
    arrayBuffer(): Promise<ArrayBuffer>;
  };
  async function serverParse(body: Uint8Array, boundary: string) {
    const res = new Response(body as unknown as BodyInit, {
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    });
    return (await res.formData()) as unknown as ParsedForm;
  }

  async function encode(fd: FormData) {
    const { body, boundary } = await convertFormDataAsync(fd);
    return { body: body as Uint8Array, boundary: boundary as string };
  }

  it("React Native's { uri } part is refused before sending (the cause)", async () => {
    const fd = new FormData();
    fd.append("screenshots", SHOT as unknown as Blob);
    await expect(encode(fd)).rejects.toThrow(
      "Unsupported FormDataPart implementation",
    );
  });

  it("the feedback body encodes, and parses as the server reads it", async () => {
    const { feedbackFormData } = jest.requireActual("../src/api/account");
    const { body, boundary } = await encode(
      feedbackFormData({ category: "bug", message: "See", screenshot: SHOT }),
    );
    const form = await serverParse(body, boundary);
    expect(form.get("category")).toBe("bug");
    expect(form.get("message")).toBe("See");
    const file = form.get("screenshots") as ParsedFile;
    expect(file.name).toBe("screenshot.jpg");
    expect(file.type).toBe("image/jpeg");
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(mockJpeg);
  });

  it("text-only feedback encodes without a file part", async () => {
    const { feedbackFormData } = jest.requireActual("../src/api/account");
    const { body, boundary } = await encode(
      feedbackFormData({ category: "other", message: "Text only" }),
    );
    const form = await serverParse(body, boundary);
    expect(form.get("message")).toBe("Text only");
    expect(form.has("screenshots")).toBe(false);
  });
});

describe("sending and preparing never race (PR #325 review #1, #2)", () => {
  function deferred<T>() {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((r) => (resolve = r));
    return { promise, resolve };
  }

  it("the screenshot row is locked while a send is in flight", async () => {
    const reply = deferred<{ sent: true }>();
    mockApi.request.mockReturnValueOnce(reply.promise);
    updateFeedbackDraft({ category: "bug", message: "See", screenshot: SHOT });
    await render(
      <Providers>
        <FeedbackScreen Attachment={ScreenshotAttachment} />
      </Providers>,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Send" }));
    for (const name of ["Replace the screenshot", "Remove the screenshot"]) {
      expect(
        screen.getByRole("button", { name }).props.accessibilityState,
      ).toMatchObject({ disabled: true });
    }
    await act(async () => reply.resolve({ sent: true }));
    expect(await screen.findByText("Thanks — sent to the owner.")).toBeTruthy();
  });

  it("Send waits while a picked image is prepared", async () => {
    const picked = deferred<typeof SHOT>();
    const Row = (p: { disabled?: boolean }) => (
      <ScreenshotAttachment {...p} pick={() => picked.promise} />
    );
    mockApi.request.mockResolvedValue({ sent: true });
    updateFeedbackDraft({ category: "bug", message: "See" });
    await render(
      <Providers>
        <FeedbackScreen Attachment={Row} />
      </Providers>,
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Add a screenshot" }),
    );
    const send = screen.getByRole("button", { name: "Send" });
    expect(send.props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(send);
    expect(mockApi.request).not.toHaveBeenCalled();
    await act(async () => picked.resolve(SHOT));
    expect(await screen.findByText("Screenshot attached")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(mockApi.request).toHaveBeenCalledTimes(1));
    const fd = mockApi.request.mock.calls[0][1].formData as {
      getParts: () => { fieldName: string }[];
    };
    expect(fd.getParts().map((x) => x.fieldName)).toContain("screenshots");
  });

  it("a pick that finishes after the draft is discarded is dropped", async () => {
    const picked = deferred<typeof SHOT>();
    let seen: ReturnType<typeof useFeedbackDraft> | null = null;
    const Probe = () => {
      seen = useFeedbackDraft();
      return null;
    };
    await render(
      <Providers>
        <ScreenshotAttachment pick={() => picked.promise} />
        <Probe />
      </Providers>,
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Add a screenshot" }),
    );
    await act(async () => {
      resetFeedbackDraft();
      picked.resolve(SHOT);
    });
    await waitFor(() => expect(mockDeleted).toContain(SHOT.uri));
    expect(seen!.screenshot).toBeNull();
    expect(seen!.preparing).toBe(false);
  });

  it("two taps in one frame open one picker", async () => {
    const picked = deferred<null>();
    const pick = jest.fn(() => picked.promise);
    await render(
      <Providers>
        <ScreenshotAttachment pick={pick} />
      </Providers>,
    );
    const add = screen.getByRole("button", { name: "Add a screenshot" });
    await fireEvent.press(add);
    await fireEvent.press(add);
    expect(pick).toHaveBeenCalledTimes(1);
    await act(async () => picked.resolve(null));
  });

  it("a server error about the screenshot clears when it is removed", async () => {
    mockApi.request.mockRejectedValueOnce(
      new ApiError("validation_error", "bad", 400, {
        screenshots: "That file isn't an image we can accept.",
      }),
    );
    updateFeedbackDraft({ category: "bug", message: "See", screenshot: SHOT });
    await render(
      <Providers>
        <FeedbackScreen Attachment={ScreenshotAttachment} />
      </Providers>,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Send" }));
    expect(
      await screen.findByText("That file isn't an image we can accept."),
    ).toBeTruthy();
    await fireEvent.press(
      screen.getByRole("button", { name: "Remove the screenshot" }),
    );
    expect(
      screen.queryByText("That file isn't an image we can accept."),
    ).toBeNull();
  });
});

describe("local image files (review #4)", () => {
  it("replace, remove, and reset delete the screenshot's file", () => {
    updateFeedbackDraft({ screenshot: SHOT });
    updateFeedbackDraft({
      screenshot: { ...SHOT, uri: "file:///cache/manip/2.jpg" },
    });
    expect(mockDeleted).toEqual([SHOT.uri]);
    updateFeedbackDraft({ screenshot: null });
    expect(mockDeleted).toEqual([SHOT.uri, "file:///cache/manip/2.jpg"]);
    updateFeedbackDraft({
      screenshot: { ...SHOT, uri: "file:///cache/manip/3.jpg" },
    });
    resetFeedbackDraft();
    expect(mockDeleted.at(-1)).toBe("file:///cache/manip/3.jpg");
  });

  it("the picker's own copy is deleted after preparing", async () => {
    const ImagePicker = jest.requireMock("expo-image-picker");
    const { ImageManipulator } = jest.requireMock("expo-image-manipulator");
    ImagePicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///picker/IMG_1.png", width: 1179, height: 2556 }],
    });
    const context = {
      resize: jest.fn(),
      renderAsync: jest.fn(async () => ({
        saveAsync: async () => ({ uri: "file:///cache/manip/9.jpg" }),
      })),
    };
    ImageManipulator.manipulate.mockReturnValue(context);
    const { pickScreenshot } = jest.requireActual(
      "../src/account/ScreenshotAttachment",
    );
    const result = await pickScreenshot();
    expect(result).toEqual({
      uri: "file:///cache/manip/9.jpg",
      name: "screenshot.jpg",
      type: "image/jpeg",
    });
    expect(context.resize).toHaveBeenCalledWith({ height: 2048 });
    expect(mockDeleted).toEqual(["file:///picker/IMG_1.png"]);
  });
});

describe("feedback route without the native picker (review #5)", () => {
  it("no row on a build without the modules; the row when they exist", () => {
    const { loadScreenshotAttachment } = jest.requireActual(
      "../src/account/native-picker",
    );
    expect(loadScreenshotAttachment(() => false)).toBeNull();
    expect(loadScreenshotAttachment(() => true)).toBe(ScreenshotAttachment);
  });
});
