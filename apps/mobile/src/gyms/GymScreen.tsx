import { useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import { Stack, router } from "expo-router";
import type { GymListItemDto } from "@overload/shared/contracts/gyms";
import { useGyms, useSetGymArchived } from "../api/resources";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { haptic } from "../ui/haptics";
import { LoadErrorState } from "../ui/LoadErrorState";
import { SkeletonCard } from "../ui/Skeleton";
import { StateView } from "../ui/StateView";
import { Chip } from "../ui/Surface";
import { Text } from "../ui/Text";
import { useTheme } from "../ui/ThemeProvider";
import { changeFailureMessage } from "../workout/messages";
import { GYM_DETAIL_NOTE, gymArchiveConfirmation } from "./gym-model";

/**
 * G2 Gym (Pitch 21h design §6, §15): one gym's name and free-text location
 * (plain text: never a link or a map), the per-gym rule in one line, and
 * Archive. After an archive the screen keeps the gym, marked, with an Undo
 * that lasts while it is open. No baseline is shown or edited (RD-11).
 */
export function GymScreen({ gymId }: { gymId: string }) {
  const { colors, spacing } = useTheme();
  const query = useGyms();
  const setArchived = useSetGymArchived();
  // The gym as it was when archived here: the list no longer holds it.
  const [archivedGym, setArchivedGym] = useState<GymListItemDto | null>(null);
  const [restored, setRestored] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const listed = query.data?.gyms.find((g) => g.id === gymId) ?? null;
  // The gym as it was when restored here: the list is re-read after an Undo,
  // and the screen keeps the gym on view until it is back (review #2).
  const [restoredGym, setRestoredGym] = useState<GymListItemDto | null>(null);
  const gym = archivedGym ?? listed ?? restoredGym;

  async function archive(target: GymListItemDto, archived: boolean) {
    setFailure(null);
    try {
      await setArchived.mutateAsync({ gymId: target.id, archived });
      void haptic.success();
      setArchivedGym(archived ? target : null);
      setRestoredGym(archived ? null : target);
      setRestored(!archived);
    } catch (error) {
      void haptic.warning();
      setFailure(
        changeFailureMessage(
          error,
          archived ? "archive" : "restore",
          "Nothing changed.",
        ),
      );
    }
  }

  function confirmArchive(target: GymListItemDto) {
    const ask = gymArchiveConfirmation(target.name);
    Alert.alert(ask.title, ask.message, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Archive",
        style: "destructive",
        onPress: () => void archive(target, true),
      },
    ]);
  }

  const body = (() => {
    if (!gym) {
      if (query.isError) {
        return (
          <LoadErrorState
            error={query.error}
            subject="This gym"
            request="GET /gyms"
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
          />
        );
      }
      if (!query.data) return <SkeletonCard rows={3} />;
      return (
        <StateView
          icon="building.2"
          title="This gym isn't available"
          message="It may have been archived on the web."
          action={{ label: "Back to Gyms", onPress: () => router.back() }}
        />
      );
    }
    const archived = archivedGym !== null;
    return (
      <View style={{ gap: spacing.lg }}>
        {failure ? <Banner message={failure} /> : null}
        {archived ? (
          <Banner
            tone="info"
            message="Archived. Past workouts keep it."
            action={{
              label: "Undo",
              hint: "Puts it back in the gym pickers",
              onPress: () => void archive(gym, false),
            }}
          />
        ) : null}
        {restored && !archived ? (
          <Banner tone="info" message="Restored." />
        ) : null}
        <View style={{ gap: spacing.xs }}>
          <Text
            size="xl"
            weight="semibold"
            tone={archived ? "muted" : "default"}
            accessibilityRole="header"
          >
            {gym.name}
          </Text>
          <Text tone="muted">{gym.address ?? "No location"}</Text>
          {archived ? <Chip label="Archived" /> : null}
        </View>
        <Text size="sm" tone="muted">
          {GYM_DETAIL_NOTE}
        </Text>
        {!archived ? (
          <View style={{ alignItems: "flex-start" }}>
            <Button
              label="Archive gym"
              variant="destructive-text"
              loading={setArchived.isPending}
              onPress={() => confirmArchive(gym)}
            />
          </View>
        ) : null}
      </View>
    );
  })();

  return (
    <>
      <Stack.Screen options={{ title: "Gym" }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
      >
        {body}
      </ScrollView>
    </>
  );
}
