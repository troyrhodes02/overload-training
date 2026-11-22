import { useState } from "react";
import { Image, View } from "react-native";
import { Text } from "./Text";
import { useTheme } from "./ThemeProvider";

/**
 * An exercise's library image in a rounded tile (Pitch 21h design §3): the
 * photo is kept whole (`contain`) on the card color, with the token border so
 * its white ground doesn't bleed into a dark card. No image — every custom
 * exercise, some library ones, or a failed load — is a letter tile, never a
 * broken image. Decorative: hidden from VoiceOver (the name is read instead).
 */
export function ExerciseImage({
  uri,
  name,
  size = 48,
  archived = false,
}: {
  uri: string | null;
  name: string;
  size?: number;
  archived?: boolean;
}) {
  const { colors, radius } = useTheme();
  const [failed, setFailed] = useState(false);
  const frame = {
    width: size,
    height: size,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: archived ? ("dashed" as const) : ("solid" as const),
    overflow: "hidden" as const,
  };
  if (!uri || failed || archived) {
    return (
      <View
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={{
          ...frame,
          backgroundColor: colors.secondary,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text weight="semibold" tone="muted">
          {archived ? "!" : (name.trim()[0] ?? "?").toUpperCase()}
        </Text>
      </View>
    );
  }
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ ...frame, backgroundColor: colors.card }}
    >
      <Image
        source={{ uri }}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
        onError={() => setFailed(true)}
        style={{ width: "100%", height: "100%" }}
      />
    </View>
  );
}
