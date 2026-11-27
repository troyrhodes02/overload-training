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
import { PRIVACY_POLICY_URL } from "@overload/shared/legal/privacy";
import { useMe } from "../../../api/queries";
import { useSession } from "../../../auth/session";
import { APP_VERSION, BUILD_NUMBER, ENV } from "../../../config/env";
import { footerLine } from "../../../diagnostics/build-identity";
import { diagnosticsAvailable } from "../../../diagnostics/availability";
import { TourScrollProvider, useTourScroll } from "../../../tour/anchors";
import { useTour } from "../../../tour/TourProvider";
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
  const tour = useTour();
  const tourScroll = useTourScroll();
  const me = useMe(true);
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
        {...tourScroll.scrollProps}
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
        <TourScrollProvider scroller={tourScroll.scroller}>
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
              tourAnchor="more-exercises"
              onPress={() => router.push("/more/exercises")}
            />
            <ListRow
              title="Gyms"
              accessory="chevron"
              tourAnchor="more-gyms"
              onPress={() => router.push("/more/gyms")}
            />
          </GroupedList>

          <GroupedList header="Updates & help">
            <ListRow
              title="What's New"
              accessory="chevron"
              onPress={() => router.push("/more/whats-new")}
            />
            {/* Pitch 21k K0: opens the tour over this screen, so no chevron. */}
            <ListRow
              title="Take a tour"
              subtitle="A one-minute walkthrough of the app"
              tourAnchor="more-tour"
              onPress={() => void tour.start("manual")}
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

          <GroupedList header="Your data">
            <ListRow
              title="Export your data"
              accessory="chevron"
              onPress={() => router.push("/more/export")}
            />
            {/* OVE-265: the one public policy, in every build (Apple 5.1.1(i)). */}
            <ListRow
              title="Privacy Policy"
              accessory="external"
              onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
            />
          </GroupedList>

          <GroupedList>
            <ListRow
              title="Sign out"
              tone="destructive"
              onPress={confirmSignOut}
            />
          </GroupedList>

          {/* Apart and last (design M1; RD-1): discoverable, never adjacent
            to a routine row. */}
          <View style={{ marginTop: spacing.md }}>
            <GroupedList>
              <ListRow
                title="Delete account"
                tone="destructive"
                accessory="chevron"
                onPress={() => router.push("/more/delete-account")}
              />
            </GroupedList>
          </View>

          <View style={{ gap: spacing.sm, alignItems: "center" }}>
            <Text size="xs" tone="muted" align="center">
              {footerLine({
                env: ENV,
                version: APP_VERSION,
                buildNumber: BUILD_NUMBER,
              })}
            </Text>
            {/* Pitch 21l A1: in every build. Diagnostics: staging only. */}
            <View style={{ alignSelf: "stretch" }}>
              <GroupedList>
                <ListRow
                  title="About this app"
                  accessory="chevron"
                  onPress={() => router.push("/more/about")}
                />
                {diagnosticsAvailable() ? (
                  <ListRow
                    title="Diagnostics"
                    accessory="chevron"
                    onPress={() => router.push("/more/diagnostics")}
                  />
                ) : null}
              </GroupedList>
            </View>
          </View>
        </TourScrollProvider>
      </ScrollView>
    </>
  );
}
