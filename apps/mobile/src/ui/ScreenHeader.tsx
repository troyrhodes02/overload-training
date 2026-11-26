import { View } from "react-native";
import { TourAnchor } from "../tour/anchors";
import { Text } from "./Text";
import { fontFamily, screenTitleSize } from "./theme";
import { useTheme } from "./ThemeProvider";

/**
 * The one header every tab's root screen uses (Pitch 21e Checkpoint A,
 * RD-24): a small uppercase context line, the screen's title, and an optional
 * subtitle. It lives in the content, not the navigation bar: tab roots hide
 * the stack header, and pushed screens keep the system back header, so two
 * headers never compete.
 */
export function ScreenHeader({
  eyebrow,
  title,
  subtitle,
  tourAnchor,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  /** The tour points at this title (Pitch 21k). */
  tourAnchor?: string;
}) {
  const { spacing } = useTheme();
  const heading = (
    <Text
      accessibilityRole="header"
      style={{
        ...screenTitleSize,
        fontFamily: fontFamily.semibold,
        letterSpacing: -0.3,
      }}
    >
      {title}
    </Text>
  );
  return (
    <View style={{ gap: spacing.xs, paddingHorizontal: spacing.xs }}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      {tourAnchor ? (
        <TourAnchor name={tourAnchor} style={{ alignSelf: "flex-start" }}>
          {heading}
        </TourAnchor>
      ) : (
        heading
      )}
      {subtitle ? (
        <Text tone="muted" style={{ fontSize: 15, lineHeight: 20 }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

/** The small uppercase label: a header's context line, a card's kicker. */
export function Eyebrow({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "primary";
}) {
  return (
    <Text
      size="xs"
      weight="medium"
      tone={tone}
      style={{ letterSpacing: 0.7, textTransform: "uppercase" }}
    >
      {children}
    </Text>
  );
}

/** A section's heading inside a screen ("Also today", "Earlier blocks"). */
export function SectionHeader({ title }: { title: string }) {
  const { spacing } = useTheme();
  return (
    <View
      style={{ paddingHorizontal: spacing.xs }}
      accessible
      accessibilityRole="header"
    >
      <Eyebrow>{title}</Eyebrow>
    </View>
  );
}
