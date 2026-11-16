import { ActivityIndicator, View } from "react-native";
import type { SymbolViewProps } from "expo-symbols";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "./Button";
import { Symbol } from "./Symbol";
import { Text } from "./Text";
import { useTheme } from "./ThemeProvider";

export type StateAction = {
  label: string;
  onPress: () => void;
  loading?: boolean;
};

/**
 * The shared loading, empty, error, and unreachable states (design §10):
 * an icon, a title, one sentence, and one action. `card` renders inside a
 * screen (the tab placeholders); GateScreen renders it full-screen.
 */
export function StateView({
  icon,
  title,
  message,
  action,
  secondaryAction,
  variant = "card",
  children,
}: {
  icon?: SymbolViewProps["name"];
  title: string;
  message?: string;
  action?: StateAction;
  secondaryAction?: StateAction;
  variant?: "card" | "plain";
  children?: React.ReactNode;
}) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View
      style={[
        { gap: spacing.md, alignItems: "stretch" },
        variant === "card" && {
          backgroundColor: colors.card,
          borderRadius: radius.xl,
          borderWidth: 1,
          borderColor: colors.border,
          padding: spacing.lg,
        },
      ]}
    >
      <View
        style={{
          flexDirection: variant === "card" ? "row" : "column",
          gap: spacing.md,
          alignItems: variant === "card" ? "flex-start" : "center",
        }}
      >
        {icon ? (
          <Symbol
            name={icon}
            size={variant === "card" ? 22 : 44}
            color={colors.mutedForeground}
          />
        ) : null}
        <View
          style={{ flex: variant === "card" ? 1 : undefined, gap: spacing.xs }}
        >
          <Text
            size={variant === "card" ? "base" : "xl"}
            weight="semibold"
            align={variant === "card" ? "left" : "center"}
            accessibilityRole="header"
          >
            {title}
          </Text>
          {message ? (
            <Text tone="muted" align={variant === "card" ? "left" : "center"}>
              {message}
            </Text>
          ) : null}
        </View>
      </View>
      {children}
      {action ? (
        <Button
          label={action.label}
          onPress={action.onPress}
          loading={action.loading}
          variant={variant === "card" ? "secondary" : "primary"}
          size={variant === "card" ? "md" : "lg"}
        />
      ) : null}
      {secondaryAction ? (
        <Button
          label={secondaryAction.label}
          onPress={secondaryAction.onPress}
          variant="text"
        />
      ) : null}
    </View>
  );
}

/** A full-screen blocking state (design §6 G1–G6). */
export function GateScreen(props: React.ComponentProps<typeof StateView>) {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        paddingTop: insets.top + spacing.xl,
        paddingBottom: insets.bottom + spacing.lg,
        paddingHorizontal: spacing.lg,
        justifyContent: "center",
      }}
    >
      <StateView {...props} variant="plain" />
    </View>
  );
}

/** G1: shown after the splash while the gate is still deciding. */
export function LaunchingScreen() {
  const { colors, spacing } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        alignItems: "center",
        justifyContent: "center",
        gap: spacing.md,
      }}
      accessibilityLabel="Opening Overload"
    >
      <ActivityIndicator color={colors.mutedForeground} />
      <Text tone="muted">Opening Overload…</Text>
    </View>
  );
}
