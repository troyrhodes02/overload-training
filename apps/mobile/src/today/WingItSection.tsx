import { View } from "react-native";
import { router } from "expo-router";
import type { WingItTodayDto } from "@overload/shared/contracts/views";
import {
  WING_IT_COPY,
  wingItFinishedLine,
  wingItOpenLine,
} from "@overload/shared/logging/wing-it";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { Surface } from "../ui/Surface";
import { Text } from "../ui/Text";
import { useTheme } from "../ui/ThemeProvider";
import { loggedWorkoutHref } from "../workout/routes";
import type { StartState } from "./useStartWorkout";

/** Which helper line the section shows beside the day's state. */
export type WingItPlacement = "no_plan" | "rest" | "planned";

/**
 * The words the section shows, from the server's state alone (pure, so the
 * states are unit-tested without rendering).
 */
export function wingItSectionModel(
  wingIt: WingItTodayDto | undefined,
  placement: WingItPlacement,
): {
  helper: string | null;
  openLine: string | null;
  action: string;
  primary: boolean;
  finished: { loggedSessionId: string; line: string }[];
} {
  const open = wingIt?.open ?? null;
  return {
    helper: open
      ? null
      : placement === "no_plan"
        ? null
        : placement === "rest"
          ? WING_IT_COPY.helperRest
          : WING_IT_COPY.helperPlanned,
    openLine: open ? wingItOpenLine(open) : null,
    action: open ? WING_IT_COPY.resume : WING_IT_COPY.start,
    // The one training action when there is no plan (design §6.1).
    primary: placement === "no_plan",
    finished: (wingIt?.finishedToday ?? []).map((w) => ({
      loggedSessionId: w.loggedSessionId,
      line: wingItFinishedLine(w),
    })),
  };
}

/**
 * Today's Wing-It section (Pitch 25 design §6, §15): on every dashboard
 * state, always outside the dimmed missed-day block, never replacing the
 * day's planned workout. Start or Resume, and the Wing-It workouts finished
 * today. The start itself is `useStartWingItWorkout`.
 */
export function WingItSection({
  wingIt,
  placement,
  state,
  stale,
  onStart,
}: {
  wingIt: WingItTodayDto | undefined;
  placement: WingItPlacement;
  state: StartState;
  stale: boolean;
  onStart: () => void;
}) {
  const { spacing } = useTheme();
  const model = wingItSectionModel(wingIt, placement);
  return (
    <Surface style={{ gap: spacing.md }}>
      <View style={{ gap: spacing.xxs }}>
        <Text size="lg" weight="semibold" accessibilityRole="header">
          {WING_IT_COPY.heading}
        </Text>
        {model.openLine ? (
          <Text size="sm" tone="muted">
            {model.openLine}
          </Text>
        ) : null}
        {model.helper ? (
          <Text size="sm" tone="muted">
            {model.helper}
          </Text>
        ) : null}
      </View>
      {model.finished.map((f) => (
        <View
          key={f.loggedSessionId}
          style={{ gap: spacing.xxs }}
          accessible={false}
        >
          <Text size="sm">{f.line}</Text>
          <Button
            label="View workout"
            variant="text"
            accessibilityLabel={`View ${f.line.replace("✓ ", "")}`}
            onPress={() => router.push(loggedWorkoutHref(f.loggedSessionId))}
          />
        </View>
      ))}
      {state.kind === "no_gym" ? (
        <View style={{ gap: spacing.sm }}>
          <Banner tone="info" message="Add the gym you train at to start." />
          <Button
            label="Add a gym"
            variant="secondary"
            onPress={() => router.push("/gym-new?from=today")}
          />
        </View>
      ) : state.kind === "error" ? (
        <Banner message={state.message} />
      ) : null}
      <Button
        label={model.action}
        variant={model.primary ? "primary" : "secondary"}
        loading={state.kind === "busy"}
        // A start needs the server; Resume only opens what it already has.
        disabled={stale && !wingIt?.open}
        onPress={onStart}
      />
    </Surface>
  );
}
