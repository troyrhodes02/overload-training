import { useState } from "react";
import { Linking, ScrollView, View } from "react-native";
import { Stack, router } from "expo-router";
import { useAppConfig } from "../api/queries";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { Text } from "../ui/Text";
import { useTheme } from "../ui/ThemeProvider";

export const HELP_INTRO =
  "Questions about your account, logging, exports, deletion, or billing? Send a message from Overload, or email the person who runs it.";

/**
 * A7 Get help (Pitch 21j design §6 A7; RD-20). The web's /support for a
 * signed-in lifter: Send feedback first, then the support address — the
 * server's configured one, never an invented one. With none configured, only
 * Send feedback is offered.
 */
export function HelpScreen() {
  const { colors, spacing } = useTheme();
  const address = useAppConfig().data?.supportEmail ?? null;
  const [mailFailed, setMailFailed] = useState(false);

  const email = async () => {
    if (!address) return;
    setMailFailed(false);
    try {
      await Linking.openURL(`mailto:${address}`);
    } catch {
      setMailFailed(true);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: "Get help" }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
      >
        <Text>{HELP_INTRO}</Text>
        {mailFailed && address ? (
          <Banner
            message={`Couldn't open Mail. You can write to ${address} from any email app.`}
          />
        ) : null}
        <View style={{ gap: spacing.sm }}>
          <Button
            label="Send feedback"
            onPress={() => router.push("/feedback?category=question")}
          />
          {address ? (
            <Button
              label="Email support"
              variant="secondary"
              onPress={() => void email()}
            />
          ) : null}
        </View>
        {address ? (
          <Text size="sm" tone="muted" align="center" selectable>
            {address}
          </Text>
        ) : null}
      </ScrollView>
    </>
  );
}
