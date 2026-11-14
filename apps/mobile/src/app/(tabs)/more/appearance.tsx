import { useRef, useState } from "react";
import { ScrollView } from "react-native";
import { Stack } from "expo-router";
import {
  APPEARANCES,
  type Appearance,
} from "@overload/shared/appearance/appearance";
import { useUpdateAppearance } from "../../../api/queries";
import { Banner } from "../../../ui/Banner";
import { GroupedList, ListRow } from "../../../ui/GroupedList";
import { useTheme, useThemeContext } from "../../../ui/ThemeProvider";

const LABEL: Record<Appearance, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

/**
 * M2 Appearance (design §6; RD-10). The choice applies at once and saves to
 * the account, so the web follows. Concurrent taps are ordered so the last
 * choice wins (the web's createChoiceTracker rule); a failed save returns the
 * last saved choice.
 */
export default function AppearanceScreen() {
  const { colors, spacing } = useTheme();
  const { preference, setPreference } = useThemeContext();
  const update = useUpdateAppearance();
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);
  const saved = useRef<Appearance>(preference);

  const choose = (next: Appearance) => {
    if (next === preference) return;
    const ticket = ++latest.current;
    setError(null);
    setPreference(next);
    update.mutate(next, {
      onSuccess: (result) => {
        if (ticket !== latest.current) return;
        saved.current = result.appearance;
      },
      onError: () => {
        if (ticket !== latest.current) return;
        setPreference(saved.current);
        setError("Couldn't save your appearance. Try again.");
      },
    });
  };

  return (
    <>
      <Stack.Screen
        options={{ title: "Appearance", headerLargeTitle: false }}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
      >
        <GroupedList footer="System follows your iPhone's setting.">
          {APPEARANCES.map((value) => (
            <ListRow
              key={value}
              title={LABEL[value]}
              accessory="check"
              selected={preference === value}
              onPress={() => choose(value)}
            />
          ))}
        </GroupedList>
        {error ? <Banner message={error} /> : null}
      </ScrollView>
    </>
  );
}
