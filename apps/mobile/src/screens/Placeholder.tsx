import { Fragment } from "react";
import { Linking, View } from "react-native";
import type { SymbolViewProps } from "expo-symbols";
import { webOrigin } from "../config/env";
import { Button } from "../ui/Button";
import { Surface } from "../ui/Surface";
import { Symbol } from "../ui/Symbol";
import { TabScreen } from "../ui/TabScreen";
import { Text } from "../ui/Text";
import { useTheme } from "../ui/ThemeProvider";

/**
 * A tab whose feature is still web-only (Pitch 21d T2–T4, RD-12; refined in
 * Pitch 21e Checkpoint A, RD-24): the shared header, one card that says what
 * the web does today and links to it, and one line of reassurance. No mock
 * data and no fake controls.
 */
export function Placeholder({
  eyebrow,
  title,
  icon,
  heading,
  message,
  webItems,
  cta,
  webPath = "/",
  footnote,
}: {
  eyebrow: string;
  title: string;
  icon: SymbolViewProps["name"];
  heading: string;
  message: string;
  /** What the lifter can do on the web now: plain facts, no controls. */
  webItems: string[];
  cta: string;
  webPath?: string;
  footnote?: string;
}) {
  const { colors, radius, spacing } = useTheme();
  const origin = webOrigin();
  return (
    <TabScreen eyebrow={eyebrow} title={title}>
      <View style={{ gap: spacing.md }}>
        <Surface style={{ gap: spacing.lg }}>
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <Symbol name={icon} size={24} color={colors.primary} />
            <View style={{ flex: 1, gap: spacing.xs }}>
              <Text size="lg" weight="semibold" accessibilityRole="header">
                {heading}
              </Text>
              <Text size="sm" tone="muted">
                {message}
              </Text>
            </View>
          </View>
          <View
            accessible
            accessibilityLabel={`On the web: ${webItems.join(", ")}`}
            style={{
              backgroundColor: colors.secondary,
              borderRadius: radius.lg,
            }}
          >
            {webItems.map((item, i) => (
              <Fragment key={item}>
                {i > 0 ? (
                  <View
                    style={{
                      height: 1,
                      marginLeft: spacing.md,
                      backgroundColor: colors.border,
                    }}
                  />
                ) : null}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing.sm,
                    minHeight: 44,
                    paddingHorizontal: spacing.md,
                  }}
                >
                  <Symbol
                    name="checkmark"
                    size={14}
                    color={colors.mutedForeground}
                  />
                  <Text style={{ flex: 1 }}>{item}</Text>
                </View>
              </Fragment>
            ))}
          </View>
          {origin ? (
            <Button
              label={cta}
              variant="secondary"
              onPress={() => void Linking.openURL(`${origin}${webPath}`)}
            />
          ) : null}
        </Surface>
        {footnote ? (
          <Text
            size="sm"
            tone="muted"
            style={{ paddingHorizontal: spacing.xs }}
          >
            {footnote}
          </Text>
        ) : null}
      </View>
    </TabScreen>
  );
}
