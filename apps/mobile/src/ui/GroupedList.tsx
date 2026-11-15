import { Children, Fragment, isValidElement } from "react";
import { Pressable, View } from "react-native";
import { Symbol } from "./Symbol";
import { Text } from "./Text";
import { useTheme } from "./ThemeProvider";

/** An iOS inset grouped list section (design §15 M1, M2). */
export function GroupedList({
  header,
  footer,
  children,
}: {
  header?: string;
  footer?: string;
  children: React.ReactNode;
}) {
  const { colors, radius, spacing } = useTheme();
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View style={{ gap: spacing.xs + 2 }}>
      {header ? (
        <Text
          size="xs"
          weight="medium"
          tone="muted"
          style={{ paddingHorizontal: spacing.lg, textTransform: "uppercase" }}
          accessibilityRole="header"
        >
          {header}
        </Text>
      ) : null}
      <View
        style={{
          backgroundColor: colors.card,
          borderRadius: radius.xl,
          overflow: "hidden",
        }}
      >
        {rows.map((row, i) => (
          <Fragment key={row.key ?? i}>
            {i > 0 ? (
              <View
                style={{
                  height: 1,
                  marginLeft: spacing.lg,
                  backgroundColor: colors.border,
                }}
              />
            ) : null}
            {row}
          </Fragment>
        ))}
      </View>
      {footer ? (
        <Text size="xs" tone="muted" style={{ paddingHorizontal: spacing.lg }}>
          {footer}
        </Text>
      ) : null}
    </View>
  );
}

export type ListRowAccessory = "chevron" | "check" | "external" | "none";

export function ListRow({
  title,
  subtitle,
  value,
  accessory = "none",
  tone = "default",
  onPress,
  accessibilityHint,
  selected,
}: {
  title: string;
  /** A second line under the title that explains this row, as in iOS Settings. */
  subtitle?: string;
  value?: string;
  accessory?: ListRowAccessory;
  tone?: "default" | "destructive";
  onPress?: () => void;
  accessibilityHint?: string;
  selected?: boolean;
}) {
  const { colors, spacing, controlHeight } = useTheme();
  const label = [title, subtitle, value].filter(Boolean).join(", ");
  const content = (
    <View
      style={{
        minHeight: controlHeight.touchMin,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
      }}
    >
      <View style={{ flex: 1, gap: spacing.xxs }}>
        <Text tone={tone === "destructive" ? "destructive" : "default"}>
          {title}
        </Text>
        {subtitle ? (
          <Text size="sm" tone="muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? <Text tone="muted">{value}</Text> : null}
      {accessory === "chevron" ? (
        <Symbol name="chevron.right" size={14} color={colors.mutedForeground} />
      ) : null}
      {accessory === "external" ? (
        <Symbol
          name="arrow.up.right"
          size={14}
          color={colors.mutedForeground}
        />
      ) : null}
      {accessory === "check" && selected ? (
        <Symbol
          name="checkmark"
          size={16}
          color={colors.primary}
          weight="semibold"
        />
      ) : null}
    </View>
  );
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={label}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={selected === undefined ? undefined : { selected }}
      style={({ pressed }) => ({
        backgroundColor: pressed ? colors.muted : "transparent",
      })}
    >
      {content}
    </Pressable>
  );
}
