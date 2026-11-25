import { useMemo, useState } from "react";
import { FlatList, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { getCalendars } from "expo-localization";
import { useProfile } from "../api/account";
import { ListRow } from "../ui/GroupedList";
import { LoadErrorState } from "../ui/LoadErrorState";
import { SkeletonCard } from "../ui/Skeleton";
import { Text } from "../ui/Text";
import { TextField } from "../ui/TextField";
import { useTheme } from "../ui/ThemeProvider";
import {
  deviceZoneSuggestion,
  filterZones,
  pickTimeZone,
} from "./profile-model";

/** The device's own zone, or null when iOS doesn't say. */
function deviceTimeZone(): string | null {
  try {
    return getCalendars()[0]?.timeZone ?? null;
  } catch {
    return null;
  }
}

/**
 * A2 Time zone (Pitch 21j design §6 A2; RD-3). The server's list (exactly
 * what it accepts), searchable, with this iPhone's zone offered first when it
 * differs. Choosing returns to Profile with the field changed, not saved.
 */
export function TimeZoneScreen() {
  const { colors, spacing } = useTheme();
  const { current = "" } = useLocalSearchParams<{ current?: string }>();
  const query = useProfile();
  const [search, setSearch] = useState("");
  const zones = query.data?.timeZones;
  const shown = useMemo(
    () => (zones ? filterZones(zones, search) : []),
    [zones, search],
  );
  const suggestion = zones
    ? deviceZoneSuggestion(deviceTimeZone(), current, zones)
    : null;
  const choose = (zone: string) => {
    pickTimeZone(zone);
    router.back();
  };

  const header = (
    <View style={{ gap: spacing.md, paddingBottom: spacing.md }}>
      <Text size="sm" tone="muted">
        Overload uses this to decide what today is.
      </Text>
      {suggestion ? (
        <View
          style={{
            backgroundColor: colors.card,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: "hidden",
          }}
        >
          <ListRow
            title={`This iPhone: ${suggestion}`}
            accessory="chevron"
            onPress={() => choose(suggestion)}
          />
        </View>
      ) : null}
      <TextField
        label="Search time zones"
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="while-editing"
      />
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title: "Time zone" }} />
      {!zones ? (
        <View
          style={{
            flex: 1,
            padding: spacing.lg,
            backgroundColor: colors.background,
          }}
        >
          {query.isError ? (
            <LoadErrorState
              error={query.error}
              subject="Time zones"
              request="GET /me/profile"
              onRetry={() => void query.refetch()}
              retrying={query.isFetching}
            />
          ) : (
            <SkeletonCard rows={6} />
          )}
        </View>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(z) => z}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentInsetAdjustmentBehavior="automatic"
          style={{ backgroundColor: colors.background }}
          contentContainerStyle={{ padding: spacing.lg }}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <Text tone="muted">{`No time zone matches “${search.trim()}”.`}</Text>
          }
          initialNumToRender={30}
          renderItem={({ item }) => (
            <View
              style={{
                backgroundColor: colors.card,
                borderBottomWidth: 1,
                borderColor: colors.border,
              }}
            >
              <ListRow
                title={item}
                accessory="check"
                selected={item === current}
                onPress={() => choose(item)}
              />
            </View>
          )}
        />
      )}
    </>
  );
}
