import { ScrollView } from "react-native";
import { useWorkout } from "../api/training";
import { SkeletonCard } from "../ui/Skeleton";
import { StateView } from "../ui/StateView";
import { Text } from "../ui/Text";
import { useTheme } from "../ui/ThemeProvider";

/** W1 Workout. The logging card arrives with OVE-201. */
export function WorkoutScreen({
  loggedSessionId,
}: {
  loggedSessionId: string;
}) {
  const { colors, spacing } = useTheme();
  const workout = useWorkout(loggedSessionId);
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
    >
      {workout.data ? (
        <Text size="lg" weight="semibold">
          {workout.data.workout.sessionName}
        </Text>
      ) : workout.isError ? (
        <StateView
          title="Couldn't load this workout"
          message={workout.error.message}
          action={{ label: "Try again", onPress: () => void workout.refetch() }}
        />
      ) : (
        <SkeletonCard />
      )}
    </ScrollView>
  );
}
