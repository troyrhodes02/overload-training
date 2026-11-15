import { Alert, Linking, RefreshControl, ScrollView, View } from "react-native";
import { router, Stack } from "expo-router";
import { billingCopy } from "@overload/shared/billing/copy";
import { useMe } from "../../../api/queries";
import { useSession } from "../../../auth/session";
import { APP_VERSION, webOrigin } from "../../../config/env";
import { diagnosticsAvailable } from "../../../diagnostics/availability";
import { GroupedList, ListRow } from "../../../ui/GroupedList";
import { Symbol } from "../../../ui/Symbol";
import { Text } from "../../../ui/Text";
import { useTheme, useThemeContext } from "../../../ui/ThemeProvider";

const APPEARANCE_LABEL = {
  system: "System",
  light: "Light",
  dark: "Dark",
} as const;

/**
 * M1 More (design §6, §15). The account card, the read-only plan row (the
 * server's words, no purchase path), appearance, the web for everything else,
 * and sign-out with a confirmation.
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
      <Stack.Screen options={{ title: "More" }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.xl }}
        refreshControl={
          <RefreshControl
            refreshing={me.isRefetching}
            onRefresh={() => void me.refetch()}
          />
        }
      >
        {profile && me.data ? (
          <View
            accessible
            accessibilityLabel={`${profile.firstName} ${profile.lastName}, @${profile.username}, ${me.data.email}${me.data.emailVerified ? ", email verified" : ""}`}
            style={{
              backgroundColor: colors.card,
              borderRadius: radius.xl,
              padding: spacing.lg,
              gap: spacing.xs,
            }}
          >
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
                {`@${profile.username} · ${me.data.email}`}
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
        ) : null}

        <GroupedList header="Plan">
          <ListRow title="Plan" value={plan} />
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
            value="On the web"
            accessory="external"
            onPress={() => open("/exercises")}
          />
          <ListRow
            title="Gyms"
            value="On the web"
            accessory="external"
            onPress={() => open("/gyms")}
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
