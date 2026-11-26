import { ScrollView } from "react-native";
import { Stack } from "expo-router";
import * as Updates from "expo-updates";
import {
  APP_VERSION,
  BUILD_NUMBER,
  ENV,
  SOURCE_COMMIT,
} from "../../../config/env";
import { describeBuildIdentity } from "../../../diagnostics/build-identity";
import { GroupedList, ListRow } from "../../../ui/GroupedList";
import { useTheme } from "../../../ui/ThemeProvider";

/**
 * About this app (Pitch 21l design §12 A1): which Overload this is. Every
 * build, read-only, public facts only.
 */
export default function AboutRoute() {
  return <AboutScreen />;
}

export function AboutScreen() {
  const { colors, spacing } = useTheme();
  const identity = describeBuildIdentity({
    env: ENV,
    version: APP_VERSION,
    buildNumber: BUILD_NUMBER,
    runtimeVersion: Updates.runtimeVersion ?? null,
    bundle: {
      dev: __DEV__,
      isEmbeddedLaunch: Updates.isEmbeddedLaunch,
      updateId: Updates.updateId,
      manifest: Updates.manifest,
      channel: Updates.channel,
      createdAt: Updates.createdAt,
      commit: SOURCE_COMMIT,
    },
  });
  return (
    <>
      <Stack.Screen
        options={{ title: "About this app", headerLargeTitle: false }}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.xl }}
      >
        <GroupedList header="This build">
          {identity.build.map((r) => (
            <ListRow key={r.title} title={r.title} value={r.value} />
          ))}
        </GroupedList>
        <GroupedList
          header="Updates"
          footer="Nothing on this screen is private. Share it when you report a problem."
        >
          {identity.updates.map((r) => (
            <ListRow key={r.title} title={r.title} value={r.value} />
          ))}
        </GroupedList>
      </ScrollView>
    </>
  );
}
