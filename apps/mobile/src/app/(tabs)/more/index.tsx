import {
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";
import { router, Stack } from "expo-router";
import { billingCopy } from "@overload/shared/billing/copy";
import { useMe } from "../../../api/queries";
import { useSession } from "../../../auth/session";
import { APP_VERSION, webOrigin } from "../../../config/env";
import { diagnosticsAvailable } from "../../../diagnostics/availability";
import { GroupedList, ListRow } from "../../../ui/GroupedList";
import { LoadErrorState } from "../../../ui/LoadErrorState";
import { SkeletonCard } from "../../../ui/Skeleton";
import { ScreenHeader } from "../../../ui/ScreenHeader";
import { Symbol } from "../../../ui/Symbol";
import { Text } from "../../../ui/Text";
import { useTheme, useThemeContext } from "../../../ui/ThemeProvider";

const APPEARANCE_LABEL = {
  system: "System",
  light: "Light",
  dark: "Dark",
} as const;

/**
 * M1 More (21d design §6; Pitch 21j design §6 M1, §15; RD-1): the account
 * card (→ Profile), the plan (→ Plan & access, read-only, no purchase path),
 * the app, updates and help, and sign-out with a confirmation.
 */
export default function MoreScreen() {
  const { colors, radius, spacing } = useTheme();
  const { preference } = useThemeContext();
  const { signOut } = useSession();
  const me = useMe(true);
  const origin = webOrigin();
  const open = (path = "") =>
    origin && void Linking.openURL(`${origin}${path}`);
  const profile = me.data?.profile;
  const plan = me.data
    ? billingCopy(me.data.entitlement.displayState, {
        trialDaysLeft: me.data.entitlement.trialDaysLeft,
        endsOn: null,
      }).shortLabel
    : "—";

  const confirmSignOut = () =>
    Alert.alert("Sign out of Overload on this iPhone?", undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => void signOut() },
    ]);

  return (
    <>
      <Stack.Screen options={{ title: "More", headerShown: false }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.md,
          paddingBottom: spacing.xxl,
          gap: spacing.xl,
        }}
        refreshControl={
          <RefreshControl
            refreshing={me.isRefetching}
            onRefresh={() => void me.refetch()}
          />
        }
      >
        <ScreenHeader eyebrow="Account and settings" title="More" />
        {profile && me.data ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${profile.firstName} ${profile.lastName}, ${profile.username ? `@${profile.username}, ` : ""}${me.data.email}${me.data.emailVerified ? ", email verified" : ""}, Profile`}
            onPress={() => router.push("/more/profile")}
            style={({ pressed }) => ({
              opacity: pressed ? 0.7 : 1,
              backgroundColor: colors.card,
              borderRadius: radius.xl,
              borderWidth: 1,
              borderColor: colors.border,
              padding: spacing.lg,
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.sm,
            })}
          >
            <View style={{ flex: 1, gap: spacing.xs }}>
              <Text size="lg" weight="semibold">
                {`${profile.firstName} ${profile.lastName}`}
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.xs,
                  flexWrap: "wrap",
                }}
              >
                <Text size="sm" tone="muted">
                  {profile.username
                    ? `@${profile.username} · ${me.data.email}`
                    : me.data.email}
                </Text>
                {me.data.emailVerified ? (
                  <Symbol
                    name="checkmark.seal.fill"
                    size={14}
                    color={colors.progress}
                  />
                ) : null}
              </View>
            </View>
            <Symbol
              name="chevron.right"
              size={14}
              color={colors.mutedForeground}
            />
          </Pressable>
        ) : me.isError ? (
          <LoadErrorState
            error={me.error}
            subject="Your account"
            request="GET /me"
            onRetry={() => void me.refetch()}
            retrying={me.isFetching}
          />
        ) : (
          <SkeletonCard rows={2} />
        )}

        <GroupedList header="Plan">
          <ListRow
            title="Plan"
            value={plan}
            accessory="chevron"
            onPress={() => router.push("/more/plan")}
          />
        </GroupedList>

        <GroupedList header="App">
          <ListRow
            title="Appearance"
            value={APPEARANCE_LABEL[preference]}
            accessory="chevron"
            onPress={() => router.push("/more/appearance")}
          />
          <ListRow
            title="Exercises"
            accessory="chevron"
            onPress={() => router.push("/more/exercises")}
          />
          <ListRow
            title="Gyms"
            accessory="chevron"
            onPress={() => router.push("/more/gyms")}
          />
        </GroupedList>

        <GroupedList header="Updates & help">
          <ListRow
            title="What's New"
            accessory="chevron"
            onPress={() => router.push("/more/whats-new")}
          />
          <ListRow
            title="Send feedback"
            accessory="chevron"
            onPress={() => router.push("/feedback")}
          />
          <ListRow
            title="Get help"
            accessory="chevron"
            onPress={() => router.push("/more/help")}
          />
        </GroupedList>

        <GroupedList header="Account">
          <ListRow
            title="Manage account on the web"
            accessory="external"
            accessibilityHint="Profile, export, deletion, and billing are on the web for now."
            onPress={() => open("/settings")}
          />
          <ListRow
            title="Sign out"
            tone="destructive"
            onPress={confirmSignOut}
          />
        </GroupedList>

        <View style={{ gap: spacing.sm, alignItems: "center" }}>
          <Text size="xs" tone="muted" align="center">
            {`Overload ${APP_VERSION} · Staging`}
          </Text>
          {diagnosticsAvailable() ? (
            <View style={{ alignSelf: "stretch" }}>
              <GroupedList>
                <ListRow
                  title="Diagnostics"
                  accessory="chevron"
                  onPress={() => router.push("/more/diagnostics")}
                />
              </GroupedList>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </>
  );
}
