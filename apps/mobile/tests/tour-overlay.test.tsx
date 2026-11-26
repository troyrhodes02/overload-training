/**
 * Pitch 21k design K1–K5, §11; spec §7.6: the overlay's accessibility, motion,
 * large text, and appearance. Presentational only; the flow tests drive it
 * through the provider.
 */
import { AccessibilityInfo, PixelRatio } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import {
  TourOverlay,
  type TourOverlayActions,
  type TourOverlayView,
} from "../src/tour/TourOverlay";
import { Providers } from "./harness";

const actions = (): TourOverlayActions => ({
  onStart: jest.fn(),
  onDismiss: jest.fn(),
  onNext: jest.fn(),
  onBack: jest.fn(),
  onSkip: jest.fn(),
});

const step = (over: Partial<Extract<TourOverlayView, { kind: "step" }>> = {}) =>
  ({
    kind: "step",
    variant: "highlight",
    stepId: "logging",
    title: "Logging a workout",
    body: "Start opens the workout one exercise at a time.",
    position: 2,
    total: 9,
    rect: { x: 24, y: 300, width: 345, height: 48 },
    targetLabel: "the Start workout button",
    where: null,
    last: false,
    ...over,
  }) as TourOverlayView;

async function show(view: TourOverlayView, a = actions()) {
  await render(
    <Providers>
      <TourOverlay view={view} actions={a} />
    </Providers>,
  );
  return a;
}

const modalAnimation = () =>
  screen.getByTestId("tour-modal", { includeHiddenElements: true }).props
    .animationType;

// The jest preset reports a font scale of 2; the default iPhone setting is 1.
beforeEach(() => jest.spyOn(PixelRatio, "getFontScale").mockReturnValue(1));
afterEach(() => jest.restoreAllMocks());

describe("the step card", () => {
  it("names the step for VoiceOver and describes what is highlighted", async () => {
    await show(step());
    const title = screen.getByRole("header");
    expect(title.props.accessibilityLabel).toBe(
      "Logging a workout, step 2 of 9",
    );
    expect(title.props.accessibilityHint).toBe(
      "Highlighting the Start workout button",
    );
    expect(screen.getByText("Step 2 of 9")).toBeTruthy();
    expect(
      screen.getByTestId("tour-spotlight", { includeHiddenElements: true }),
    ).toBeTruthy();
  });

  it("is modal for VoiceOver, and the dim layer is hidden from it", async () => {
    await show(step());
    expect(
      screen.getByTestId("tour-overlay").props.accessibilityViewIsModal,
    ).toBe(true);
    for (const dim of screen.getAllByTestId("tour-dim", {
      includeHiddenElements: true,
    })) {
      expect(dim).toBeTruthy();
    }
    expect(screen.queryAllByTestId("tour-dim")).toHaveLength(0);
  });

  it("moves VoiceOver focus to the title", async () => {
    jest.useFakeTimers();
    const spy = jest
      .spyOn(AccessibilityInfo, "sendAccessibilityEvent")
      .mockImplementation(() => {});
    await show(step());
    await act(async () => {
      jest.advanceTimersByTime(200);
    });
    expect(spy).toHaveBeenCalledWith(expect.anything(), "focus");
    jest.useRealTimers();
  });

  it("Next, Back, and Skip tour call their actions; escape skips", async () => {
    const a = await show(step());
    await fireEvent.press(screen.getByRole("button", { name: "Next" }));
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    await fireEvent.press(screen.getByRole("button", { name: "Skip tour" }));
    await fireEvent(screen.getByTestId("tour-card"), "accessibilityEscape");
    expect(a.onNext).toHaveBeenCalledTimes(1);
    expect(a.onBack).toHaveBeenCalledTimes(1);
    expect(a.onSkip).toHaveBeenCalledTimes(2);
  });

  it("the first step has no Back; the last says Done", async () => {
    await show(step({ position: 1 }));
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    await screen.unmount();
    await show(step({ position: 9, last: true }));
    expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();
  });

  it("a fallback shows no spotlight and says where to find it", async () => {
    await show(
      step({
        variant: "fallback",
        rect: null,
        targetLabel: null,
        where: "Find this in the Goals tab.",
      }),
    );
    expect(
      screen.queryByTestId("tour-spotlight", { includeHiddenElements: true }),
    ).toBeNull();
    expect(screen.getByText("Find this in the Goals tab.")).toBeTruthy();
    expect(screen.getByRole("header").props.accessibilityHint).toBeUndefined();
  });
});

describe("intro and locating", () => {
  it("the intro offers Start tour and Not now; escape dismisses", async () => {
    const a = await show({
      kind: "intro",
      title: "Take a quick tour",
      body: "Body",
      start: "Start tour",
      dismiss: "Not now",
    });
    await fireEvent.press(screen.getByRole("button", { name: "Start tour" }));
    await fireEvent.press(screen.getByRole("button", { name: "Not now" }));
    await fireEvent(screen.getByTestId("tour-card"), "accessibilityEscape");
    expect(a.onStart).toHaveBeenCalledTimes(1);
    expect(a.onDismiss).toHaveBeenCalledTimes(2);
  });

  it("locating always offers Skip tour, and a spinner only after a moment", async () => {
    jest.useFakeTimers();
    const a = await show({ kind: "locating" });
    expect(screen.queryByLabelText("Finding the next step")).toBeNull();
    await act(async () => {
      jest.advanceTimersByTime(450);
    });
    expect(screen.getByLabelText("Finding the next step")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Skip tour" }));
    expect(a.onSkip).toHaveBeenCalled();
    jest.useRealTimers();
  });
});

describe("motion, text size, appearance", () => {
  it("fades in normally and appears without animation under Reduce Motion", async () => {
    await show(step());
    expect(modalAnimation()).toBe("fade");
    await screen.unmount();
    jest
      .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
      .mockResolvedValue(true);
    await show(step());
    await act(async () => {});
    expect(modalAnimation()).toBe("none");
  });

  it("large text stacks the buttons; default text keeps one row", async () => {
    await show(step());
    expect(screen.getByTestId("tour-buttons-row")).toBeTruthy();
    await screen.unmount();
    jest.spyOn(PixelRatio, "getFontScale").mockReturnValue(1.6);
    await show(step());
    expect(screen.getByTestId("tour-buttons-stacked")).toBeTruthy();
  });
});
