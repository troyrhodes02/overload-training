import { useState } from "react";
import { ScrollView } from "react-native";
import { Stack } from "expo-router";
import { useFetchExport } from "../api/account";
import { ApiError } from "../api/errors";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { Text } from "../ui/Text";
import { useTheme } from "../ui/ThemeProvider";
import {
  ExportWriteFailed,
  shareExport,
  type ExportOutcome,
} from "./export-file";

export const EXPORT_INTRO =
  "A complete copy of everything in your account: your profile, plans, every logged workout and set, goals, gyms, custom exercises, cardio, and feedback. It's one JSON file, the same one the website downloads.";
export const EXPORT_FOOTNOTE =
  "The file is made on your iPhone only while you share it, and removed afterwards.";

/** What a failed export says (design A8). Nothing is left on the phone. */
export function exportFailure(error: unknown): string {
  if (error instanceof ExportWriteFailed) {
    return "There isn't enough space on this iPhone to prepare the file.";
  }
  if (error instanceof ApiError && error.code === "network") {
    return "Overload needs a connection to export.";
  }
  return "Couldn't prepare your export. Try again.";
}

/**
 * A8 Export your data (Pitch 21j design §6 A8, §15; RD-8, RD-12, RD-13). Free
 * on every plan. The server's complete export, through the iOS share sheet.
 */
export function ExportScreen({
  share = shareExport,
}: {
  share?: (doc: unknown) => Promise<ExportOutcome>;
}) {
  const { colors, spacing } = useTheme();
  const fetchExport = useFetchExport();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function run() {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    try {
      await share(await fetchExport());
    } catch (error) {
      setFailure(exportFailure(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: "Export your data" }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
      >
        <Text>{EXPORT_INTRO}</Text>
        {failure ? <Banner message={failure} /> : null}
        <Button
          label={busy ? "Preparing…" : "Export"}
          loading={busy}
          onPress={() => void run()}
        />
        <Text size="sm" tone="muted">
          {EXPORT_FOOTNOTE}
        </Text>
      </ScrollView>
    </>
  );
}
