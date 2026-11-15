import { useRef, useState } from "react";
import { ScrollView } from "react-native";
import { Stack } from "expo-router";
import {
  APPEARANCES,
  type Appearance,
} from "@overload/shared/appearance/appearance";
import { useQueryClient } from "@tanstack/react-query";
import { setCachedAppearance, useUpdateAppearance } from "../../../api/queries";
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
 * the account, so the web follows. Saves run one at a time: a tap during a
 * save is queued, and only the newest queued choice is sent next, so the last
 * choice wins on the screen and on the server (review #2). A failed save
 * returns the last saved choice, and says so only when that differs from the
 * lifter's latest choice: a superseded save that fails while the newest
 * choice is already the saved one has lost nothing.
 */
export default function AppearanceScreen() {
  const { colors, spacing } = useTheme();
  const { preference, setPreference } = useThemeContext();
  const client = useQueryClient();
  const update = useUpdateAppearance();
  const [error, setError] = useState<string | null>(null);
  const saved = useRef<Appearance>(preference);
  const latest = useRef<Appearance>(preference);
  const inFlight = useRef(false);
  const queued = useRef<Appearance | null>(null);

  const save = (value: Appearance) => {
    inFlight.current = true;
    update.mutate(value, {
      onSuccess: (result) => {
        saved.current = result.appearance;
      },
      onSettled: (result, failure) => {
        inFlight.current = false;
        const next = queued.current;
        queued.current = null;
        if (next !== null && next !== saved.current) return save(next);
        if (failure) {
          const lost = latest.current !== saved.current;
          latest.current = saved.current;
          setPreference(saved.current);
          if (lost) setError("Couldn't save your appearance. Try again.");
        } else if (result) {
          setCachedAppearance(client, result.appearance);
        }
      },
    });
  };

  const choose = (next: Appearance) => {
    if (next === preference) return;
    setError(null);
    latest.current = next;
    setPreference(next);
    if (inFlight.current) queued.current = next;
    else save(next);
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
