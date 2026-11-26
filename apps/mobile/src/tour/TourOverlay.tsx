import { type ComponentRef, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Modal,
  PixelRatio,
  ScrollView,
  View,
  useWindowDimensions,
  type Text as RNText,
} from "react-native";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "../ui/Button";
import { Eyebrow } from "../ui/ScreenHeader";
import { Text } from "../ui/Text";
import { useTheme } from "../ui/ThemeProvider";
import {
  cardPlacement,
  dimRects,
  SCREEN_MARGIN,
  spotlight,
  visibleBand,
  type CardPlacement,
} from "./geometry";
import type { Rect } from "./types";

/**
 * The tour's overlay (Pitch 21k design K1–K5, §11; spec §7.6, RD-1). One
 * React Native Modal for the whole run: the only surface sure to cover the
 * UIKit tab bar and anything on the root stack, and it keeps VoiceOver inside
 * the card. Every touch outside the card lands on the overlay and does
 * nothing, so the highlighted control can't be pressed through it (RD-7).
 * Purely presentational: the provider decides what it shows.
 */

type TitleHost = ComponentRef<typeof RNText>;

/** Wait this long while locating before showing a spinner. */
export const LOCATING_SPINNER_DELAY_MS = 400;
/** At this text size and above, the card's buttons stack. */
export const STACK_BUTTONS_FONT_SCALE = 1.3;

export type TourOverlayView =
  | {
      readonly kind: "intro";
      readonly title: string;
      readonly body: string;
      readonly start: string;
      readonly dismiss: string;
    }
  | { readonly kind: "locating" }
  | {
      readonly kind: "step";
      /** highlight: a measured target; fallback: in words; note: by design. */
      readonly variant: "highlight" | "fallback" | "note";
      readonly stepId: string;
      readonly title: string;
      readonly body: string;
      readonly position: number;
      readonly total: number;
      readonly rect: Rect | null;
      /** VoiceOver: what is highlighted ("the Start workout button"). */
      readonly targetLabel: string | null;
      /** Fallback only: "Find this in the Goals tab." */
      readonly where: string | null;
      readonly last: boolean;
    };

export type TourOverlayActions = {
  onStart: () => void;
  onDismiss: () => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
};

/** Reduce Motion, read once and followed while it changes. */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setReduce(v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (v: boolean) => setReduce(v),
    );
    return () => {
      alive = false;
      sub?.remove();
    };
  }, []);
  return reduce;
}

/**
 * `view` null means the run has ended: the Modal is told to dismiss
 * (`visible` false) with nothing in it, and the provider unmounts it once iOS
 * reports it gone (`onDismissed`), so it is dismissed the way React Native
 * expects and never lingers over the app.
 */
export function TourOverlay({
  view,
  actions,
  reduceMotion,
  onDismissed,
}: {
  view: TourOverlayView | null;
  actions: TourOverlayActions;
  /** Read by the provider before the first run, so even it doesn't fade. */
  reduceMotion: boolean;
  onDismissed?: () => void;
}) {
  const theme = useTheme();
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const band = visibleBand(window, insets);
  const spot =
    view?.kind === "step" && view.rect
      ? spotlight(view.rect, band, window)
      : null;

  return (
    <Modal
      testID="tour-modal"
      visible={view !== null}
      transparent
      animationType={reduceMotion ? "none" : "fade"}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      supportedOrientations={["portrait"]}
      onDismiss={onDismissed}
      onRequestClose={
        view?.kind === "intro" ? actions.onDismiss : actions.onSkip
      }
    >
      {view ? (
        <View
          testID="tour-overlay"
          accessibilityViewIsModal
          // The overlay swallows every touch that isn't on the card.
          onStartShouldSetResponder={() => true}
          style={{ flex: 1 }}
        >
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
            }}
          >
            {spot ? (
              <>
                {dimRects(spot, window).map((r, i) => (
                  <View
                    key={i}
                    testID="tour-dim"
                    style={{
                      position: "absolute",
                      left: r.x,
                      top: r.y,
                      width: r.width,
                      height: r.height,
                      backgroundColor: theme.overlay,
                    }}
                  />
                ))}
                <View
                  testID="tour-spotlight"
                  style={{
                    position: "absolute",
                    left: spot.x,
                    top: spot.y,
                    width: spot.width,
                    height: spot.height,
                    borderRadius: theme.radius.lg,
                    borderWidth: 2,
                    borderColor: theme.colors.primary,
                  }}
                />
              </>
            ) : (
              <View
                testID="tour-dim"
                style={{ flex: 1, backgroundColor: theme.overlay }}
              />
            )}
          </View>

          {view.kind === "locating" ? (
            <Locating onSkip={actions.onSkip} bottomInset={insets.bottom} />
          ) : (
            <Card
              view={view}
              actions={actions}
              placement={
                view.kind === "intro"
                  ? cardPlacement(null, band, window, "center")
                  : cardPlacement(
                      spot,
                      band,
                      window,
                      view.variant === "note"
                        ? "note"
                        : spot
                          ? "highlight"
                          : "center",
                    )
              }
            />
          )}
        </View>
      ) : null}
    </Modal>
  );
}

function Locating({
  onSkip,
  bottomInset,
}: {
  onSkip: () => void;
  bottomInset: number;
}) {
  const { colors, spacing } = useTheme();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), LOCATING_SPINNER_DELAY_MS);
    return () => clearTimeout(t);
  }, []);
  return (
    <View style={{ flex: 1 }} pointerEvents="box-none">
      <View
        style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        pointerEvents="none"
      >
        {slow ? (
          <ActivityIndicator
            accessibilityLabel="Finding the next step"
            color={colors.primaryForeground}
          />
        ) : null}
      </View>
      <View
        style={{
          paddingBottom: bottomInset + spacing.lg,
          alignItems: "center",
        }}
      >
        <Button label="Skip tour" variant="text" onPress={onSkip} />
      </View>
    </View>
  );
}

function Card({
  view,
  actions,
  placement,
}: {
  view: Exclude<TourOverlayView, { kind: "locating" }>;
  actions: TourOverlayActions;
  placement: CardPlacement;
}) {
  const { colors, radius, spacing } = useTheme();
  const titleRef = useRef<TitleHost>(null);
  const stack = PixelRatio.getFontScale() >= STACK_BUTTONS_FONT_SCALE;
  const key = view.kind === "intro" ? "intro" : view.stepId;

  // VoiceOver: move focus to the card's title each time the step changes,
  // once the modal has had a moment to present.
  useEffect(() => {
    const t = setTimeout(() => {
      if (titleRef.current) {
        AccessibilityInfo.sendAccessibilityEvent(titleRef.current, "focus");
      }
    }, 150);
    return () => clearTimeout(t);
  }, [key]);

  const position = (() => {
    switch (placement.kind) {
      case "below":
        return { top: placement.top };
      case "above":
      case "bottom":
        return { bottom: placement.bottom };
      default:
        return { top: 0, bottom: 0, justifyContent: "center" as const };
    }
  })();

  const titleLabel =
    view.kind === "step"
      ? `${view.title}, step ${view.position} of ${view.total}`
      : view.title;
  const titleHint =
    view.kind === "step" && view.targetLabel
      ? `Highlighting ${view.targetLabel}`
      : undefined;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: SCREEN_MARGIN,
        right: SCREEN_MARGIN,
        ...position,
      }}
    >
      <View
        testID="tour-card"
        onAccessibilityEscape={
          view.kind === "intro" ? actions.onDismiss : actions.onSkip
        }
        style={{
          maxHeight: Math.max(placement.maxHeight, 0) || undefined,
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: radius.xl,
          overflow: "hidden",
        }}
      >
        <ScrollView
          bounces={false}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
        >
          {view.kind === "step" ? (
            <Eyebrow>{`Step ${view.position} of ${view.total}`}</Eyebrow>
          ) : null}
          <Text
            ref={titleRef}
            size="lg"
            weight="semibold"
            accessibilityRole="header"
            accessibilityLabel={titleLabel}
            accessibilityHint={titleHint}
          >
            {view.title}
          </Text>
          <Text>{view.body}</Text>
          {view.kind === "step" && view.where ? (
            <Text size="sm" tone="muted">
              {view.where}
            </Text>
          ) : null}
          {view.kind === "intro" ? (
            <View style={{ gap: spacing.xs }}>
              <Button label={view.start} onPress={actions.onStart} />
              <Button
                label={view.dismiss}
                variant="text"
                onPress={actions.onDismiss}
              />
            </View>
          ) : (
            <StepButtons
              stack={stack}
              first={view.position === 1}
              last={view.last}
              actions={actions}
            />
          )}
        </ScrollView>
      </View>
    </View>
  );
}

function StepButtons({
  stack,
  first,
  last,
  actions,
}: {
  stack: boolean;
  first: boolean;
  last: boolean;
  actions: TourOverlayActions;
}) {
  const { spacing } = useTheme();
  const next = (
    <Button label={last ? "Done" : "Next"} size="md" onPress={actions.onNext} />
  );
  const back = first ? null : (
    <Button
      label="Back"
      variant="secondary"
      size="md"
      onPress={actions.onBack}
    />
  );
  const skip = (
    <Button
      label="Skip tour"
      variant="text"
      size="md"
      onPress={actions.onSkip}
    />
  );
  if (stack) {
    return (
      <View testID="tour-buttons-stacked" style={{ gap: spacing.sm }}>
        {next}
        {back}
        {skip}
      </View>
    );
  }
  return (
    <View
      testID="tour-buttons-row"
      style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}
    >
      {skip}
      <View style={{ flex: 1 }} />
      {back}
      {next}
    </View>
  );
}
