import { View } from "react-native";
import { formatReleaseDate } from "@overload/shared/release-notes/catalog";
import type { ReleaseNoteView } from "@overload/shared/contracts/release-notes";
import { Text } from "../ui/Text";
import { useTheme } from "../ui/ThemeProvider";

/** One What's New entry (A4, A5): date, title, the whole body. */
export function ReleaseNoteItem({ entry }: { entry: ReleaseNoteView }) {
  const { spacing } = useTheme();
  const date = formatReleaseDate(entry.date);
  return (
    <View
      accessible
      accessibilityLabel={`${date}. ${entry.title}. ${entry.body}`}
      style={{ gap: spacing.xs, paddingVertical: spacing.lg }}
    >
      <Text size="sm" tone="muted">
        {date}
      </Text>
      <Text size="lg" weight="semibold">
        {entry.title}
      </Text>
      <Text tone="muted">{entry.body}</Text>
    </View>
  );
}

/** Entries with a hairline between them. */
export function ReleaseNoteList({ entries }: { entries: ReleaseNoteView[] }) {
  const { colors } = useTheme();
  return (
    <View>
      {entries.map((e, i) => (
        <View
          key={e.id}
          style={
            i > 0
              ? { borderTopWidth: 1, borderTopColor: colors.border }
              : undefined
          }
        >
          <ReleaseNoteItem entry={e} />
        </View>
      ))}
    </View>
  );
}
