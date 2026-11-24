import { Image, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppConfig } from "../../api/queries";
import { Button } from "../../ui/Button";
import { Banner } from "../../ui/Banner";
import {
  setSignedOutNotice,
  useSignedOutNotice,
} from "../../accounts/signed-out-notice";
import { EnvironmentBadge } from "../../ui/EnvironmentBadge";
import { Text } from "../../ui/Text";
import { useTheme } from "../../ui/ThemeProvider";

/** S1 Welcome (design §15): one line, two actions, thumb-reachable. */
export default function WelcomeScreen() {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const signupOpen = useAppConfig().data?.signupMode === "public";
  // Pitch 21j A9: "Your account was deleted." once, after a deletion.
  const notice = useSignedOutNotice();
  const go = (href: "/sign-in" | "/sign-up") => {
    setSignedOutNotice(null);
    router.push(href);
  };
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        paddingTop: insets.top,
        paddingBottom: insets.bottom + spacing.lg,
        paddingHorizontal: spacing.lg,
      }}
    >
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          gap: spacing.md,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.sm,
          }}
        >
          <Image
            source={require("../../../assets/splash-icon.png")}
            style={{ width: 40, height: 40 }}
            accessibilityIgnoresInvertColors
          />
          <Text size="2xl" weight="semibold" accessibilityRole="header">
            Overload
          </Text>
        </View>
        <EnvironmentBadge />
        <Text tone="muted" align="center" style={{ maxWidth: 280 }}>
          Train on your plan. Know when to add weight.
        </Text>
      </View>
      <View style={{ gap: spacing.sm }}>
        {notice ? <Banner tone="info" message={notice} /> : null}
        <Button label="Sign in" onPress={() => go("/sign-in")} />
        {signupOpen ? (
          <Button
            label="Create an account"
            variant="secondary"
            onPress={() => go("/sign-up")}
          />
        ) : (
          <Text size="sm" tone="muted" align="center">
            New accounts can&apos;t be created right now.
          </Text>
        )}
      </View>
    </View>
  );
}
