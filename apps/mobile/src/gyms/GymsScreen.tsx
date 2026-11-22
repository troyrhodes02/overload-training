import { useCallback } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { Stack, router, useFocusEffect } from "expo-router";
import { useGyms } from "../api/resources";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { GroupedList, ListRow } from "../ui/GroupedList";
import { LoadErrorState } from "../ui/LoadErrorState";
import { clearNotice, useNotice } from "../ui/notice-store";
import { SkeletonCard } from "../ui/Skeleton";
import { StateView } from "../ui/StateView";
import { useTheme } from "../ui/ThemeProvider";
import { GYMS_FOOTNOTE, gymHref } from "./gym-model";

/**
 * G1 Gyms (Pitch 21h design §6, §15): the account's active gyms — the same
 * records the start sheet offers — with the free-text location under each
 * name (shown only here and on G2), and + to add one.
 */
export function GymsScreen() {
  const { colors, spacing } = useTheme();
  const query = useGyms();
  const notice = useNotice("gyms");
  useFocusEffect(useCallback(() => () => clearNotice("gyms"), []));
  const gyms = query.data?.gyms;
  const add = () => router.push("/gym-new");

  const body = (() => {
    if (!gyms) {
      return query.isError ? (
        <LoadErrorState
          error={query.error}
          subject="Your gyms"
          request="GET /gyms"
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : (
        <SkeletonCard rows={3} />
      );
    }
    if (gyms.length === 0) {
      return (
        <StateView
          icon="building.2"
          title="No gyms yet. Add the gym you train at."
          action={{ label: "Add a gym", onPress: add }}
        />
      );
    }
    return (
      <GroupedList footer={GYMS_FOOTNOTE}>
        {gyms.map((g) => (
          <ListRow
            key={g.id}
            title={g.name}
            subtitle={g.address ?? undefined}
            accessory="chevron"
            onPress={() => router.push(gymHref(g.id))}
          />
        ))}
      </GroupedList>
    );
  })();

  return (
    <>
      <Stack.Screen
        options={{
          title: "Gyms",
          headerRight: () => (
            <Button
              label="+"
              variant="text"
              accessibilityLabel="Add a gym"
              onPress={add}
            />
          ),
        }}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
            tintColor={colors.mutedForeground}
          />
        }
      >
        {notice ? (
          <View>
            <Banner tone="info" message={notice.message} />
          </View>
        ) : null}
        {body}
      </ScrollView>
    </>
  );
}
