import { RefreshControl, ScrollView } from "react-native";
import { Stack } from "expo-router";
import { useReleaseNotes } from "../api/account";
import { LoadErrorState } from "../ui/LoadErrorState";
import { SkeletonCard } from "../ui/Skeleton";
import { StateView } from "../ui/StateView";
import { Text } from "../ui/Text";
import { useTheme } from "../ui/ThemeProvider";
import { ReleaseNoteList } from "./ReleaseNoteItem";

export const WHATS_NEW_EMPTY =
  "No updates yet. When something changes in Overload, it's listed here.";

/**
 * A4 What's New (Pitch 21j design §6 A4; RD-5): every update, newest first,
 * from the canonical catalog. Reading it marks nothing, as on the web.
 */
export function WhatsNewScreen() {
  const { colors, spacing } = useTheme();
  const query = useReleaseNotes();
  const entries = query.data?.entries;
  const body = !entries ? (
    query.isError ? (
      <LoadErrorState
        error={query.error}
        subject="What's New"
        request="GET /release-notes"
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    ) : (
      <SkeletonCard rows={3} />
    )
  ) : entries.length === 0 ? (
    <StateView icon="sparkles" title={WHATS_NEW_EMPTY} />
  ) : (
    <ReleaseNoteList entries={entries} />
  );
  return (
    <>
      <Stack.Screen options={{ title: "What's New" }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
            tintColor={colors.mutedForeground}
          />
        }
      >
        <Text tone="muted">Every update to Overload, newest first.</Text>
        {body}
      </ScrollView>
    </>
  );
}
