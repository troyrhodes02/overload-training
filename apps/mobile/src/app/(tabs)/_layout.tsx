import { NativeTabs } from "expo-router/native-tabs";
import { useEffect } from "react";
import { WhatsNewSheet } from "../../account/WhatsNewSheet";
import { clearExportFiles } from "../../account/export-file";
import { fontFamily } from "../../ui/theme";
import { useTheme } from "../../ui/ThemeProvider";

/**
 * The signed-in shell: the system tab bar (UIKit) with SF Symbols (RD-1).
 * Each tab is a folder with its own native stack, so later slices add
 * screens without touching this file.
 */
export default function TabsLayout() {
  const { colors } = useTheme();
  // Pitch 21j RD-13: an export interrupted last time never lingers.
  useEffect(() => clearExportFiles(), []);
  return (
    <>
      {/* Pitch 21j A5: significant unseen updates, once per launch. */}
      <WhatsNewSheet />
      <NativeTabs
        tintColor={colors.primary}
        iconColor={colors.mutedForeground}
        labelStyle={{ fontFamily: fontFamily.medium, fontSize: 10 }}
      >
        <NativeTabs.Trigger name="today">
          <NativeTabs.Trigger.Icon
            sf={{ default: "sun.max", selected: "sun.max.fill" }}
          />
          <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="history">
          <NativeTabs.Trigger.Icon sf="clock.arrow.circlepath" />
          <NativeTabs.Trigger.Label>History</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="plan">
          <NativeTabs.Trigger.Icon
            sf={{
              default: "list.bullet.rectangle",
              selected: "list.bullet.rectangle.fill",
            }}
          />
          <NativeTabs.Trigger.Label>Plan</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="goals">
          <NativeTabs.Trigger.Icon sf="target" />
          <NativeTabs.Trigger.Label>Goals</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="more">
          <NativeTabs.Trigger.Icon
            sf={{
              default: "ellipsis.circle",
              selected: "ellipsis.circle.fill",
            }}
          />
          <NativeTabs.Trigger.Label>More</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    </>
  );
}
