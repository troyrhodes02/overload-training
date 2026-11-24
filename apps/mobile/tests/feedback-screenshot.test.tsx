/**
 * Pitch 21j design A6 (OVE-252; RD-9, RD-10): one screenshot the lifter
 * chooses, reviewed, replaced, or removed, prepared as a small JPEG, and sent
 * as the multipart file part with the message.
 */
import {
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
jest.mock("expo-file-system", () => ({
  File: class {
    size = 1000;
  },
}));
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
    await fireEvent.press(screen.getByRole("button", { name: "Remove" }));
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
        <FeedbackScreen attachment={<ScreenshotAttachment />} />
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
      getParts: () => { fieldName: string; uri?: string; name?: string }[];
    };
    const parts = fd.getParts();
    expect(parts.map((p) => p.fieldName)).toEqual([
      "category",
      "message",
      "screenshots",
    ]);
    expect(parts[2]).toMatchObject({
      uri: SHOT.uri,
      name: "screenshot.jpg",
      type: "image/jpeg",
    });
    // The same intent: one key across the retry.
    expect(mockApi.request.mock.calls[0][1].headers).toEqual(
      mockApi.request.mock.calls[1][1].headers,
    );
  });
});
