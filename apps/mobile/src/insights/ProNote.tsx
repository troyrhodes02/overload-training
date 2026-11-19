import { Pressable, View } from "react-native";
import { Symbol } from "../ui/Symbol";
import { Text } from "../ui/Text";
import { useTheme } from "../ui/ThemeProvider";
import {
  dismissProNote,
  useProNoteDismissed,
  type ProNoteSurface,
} from "./pro-note-store";

/**
 * The quiet Pro note (Pitch 21g design §6, RD-12): one plain sentence where
 * the server withheld a call from a Free account, and a dismiss control.
 * Deliberately no link, price, or button: there is no purchase flow in the
 * app. It renders only when the server marked the result `locked`.
 */
export function ProNote({
  surface,
  message,
}: {
  surface: ProNoteSurface;
  message: string;
}) {
  const { colors, spacing } = useTheme();
  const dismissed = useProNoteDismissed(surface);
  if (dismissed) return null;
  return (
    <View
      testID="pro-note"
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: spacing.sm,
      }}
    >
      <Text size="sm" tone="muted" style={{ flex: 1, paddingTop: spacing.sm }}>
        {message}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Dismiss: ${message}`}
        hitSlop={4}
        onPress={() => dismissProNote(surface)}
        style={({ pressed }) => ({
          width: 44,
          height: 44,
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Symbol name="xmark" size={14} color={colors.mutedForeground} />
      </Pressable>
    </View>
  );
}
