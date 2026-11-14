import { useState } from "react";
import { Pressable, View } from "react-native";
import { WebView } from "react-native-webview";
import {
  challengeHtml,
  isAllowedChallengeUrl,
  parseChallengeMessage,
} from "../accounts/challenge";
import { Text } from "./Text";
import { useTheme } from "./ThemeProvider";

export type BotChallengeConfig = { siteKey: string; origin: string };

/**
 * S4 (design §6): the Turnstile widget in a small web view card. `onToken`
 * receives a fresh token, or null when it expires or fails. Changing
 * `resetKey` reloads the widget, because a token is single-use and every
 * failed submit needs a new one.
 */
export function BotChallenge({
  config,
  onToken,
  resetKey,
}: {
  config: BotChallengeConfig;
  onToken: (token: string | null) => void;
  resetKey: number;
}) {
  const theme = useTheme();
  const { colors, radius, spacing } = theme;
  const [state, setState] = useState<"loading" | "ready" | "expired" | "error">(
    "loading",
  );
  const [reload, setReload] = useState(0);
  const retry = () => {
    onToken(null);
    setState("loading");
    setReload((n) => n + 1);
  };
  const failed = state === "expired" || state === "error";
  return (
    <View
      accessibilityLabel="Verification that you're human"
      style={{
        minHeight: 72,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
        overflow: "hidden",
        justifyContent: "center",
      }}
    >
      {failed ? (
        <Pressable
          onPress={retry}
          accessibilityRole="button"
          style={{
            padding: spacing.lg,
            minHeight: 72,
            justifyContent: "center",
          }}
        >
          <Text size="sm" tone="destructive" align="center">
            {state === "expired"
              ? "Verification expired. Tap to retry."
              : "Couldn't load the check. Tap to retry."}
          </Text>
        </Pressable>
      ) : (
        <WebView
          key={`${resetKey}-${reload}-${theme.scheme}`}
          source={{
            html: challengeHtml(config.siteKey, theme.scheme),
            baseUrl: config.origin,
          }}
          originWhitelist={["*"]}
          onShouldStartLoadWithRequest={(req) =>
            isAllowedChallengeUrl(req.url, config.origin)
          }
          setSupportMultipleWindows={false}
          javaScriptCanOpenWindowsAutomatically={false}
          incognito
          scrollEnabled={false}
          style={{ height: 70, backgroundColor: "transparent" }}
          containerStyle={{ backgroundColor: "transparent" }}
          onLoadEnd={() => setState((s) => (s === "loading" ? "ready" : s))}
          onError={() => {
            setState("error");
            onToken(null);
          }}
          onMessage={(event) => {
            const m = parseChallengeMessage(event.nativeEvent.data);
            if (!m) return;
            if (m.type === "token") onToken(m.token);
            else {
              onToken(null);
              setState(m.type);
            }
          }}
        />
      )}
    </View>
  );
}
