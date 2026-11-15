import { useState } from "react";
import { View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import type { PasswordResetRequest } from "@overload/shared/contracts/requests";
import type { PasswordResetResponseDto } from "@overload/shared/contracts/account";
import { useApi } from "../../api/ApiProvider";
import { ApiError, MESSAGES } from "../../api/errors";
import { useAppConfig } from "../../api/queries";
import { Banner } from "../../ui/Banner";
import { BotChallenge } from "../../ui/BotChallenge";
import { Button } from "../../ui/Button";
import { FormScreen } from "../../ui/FormScreen";
import { haptic } from "../../ui/haptics";
import { Text } from "../../ui/Text";
import { TextField } from "../../ui/TextField";

/**
 * S5 Reset password (design §6; spec §10.5). The request is native; the link
 * in the email completes the reset on the web. The sent state is word for
 * word the web's, identical for every address.
 */
export default function ResetPasswordScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const api = useApi();
  const challenge = useAppConfig().data?.botChallenge ?? null;
  const challengeUsable =
    !challenge || (challenge.siteKey !== null && challenge.origin !== null);
  const [email, setEmail] = useState(
    typeof params.email === "string" ? params.email : "",
  );
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [challengeReset, setChallengeReset] = useState(0);
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (pending || !challengeUsable || (challenge && !token)) return;
    if (!email.trim()) {
      setError("Enter your email.");
      haptic.warning();
      return;
    }
    setPending(true);
    setError(null);
    try {
      const body: PasswordResetRequest = {
        email: email.trim(),
        challengeToken: token,
      };
      await api.request<PasswordResetResponseDto>("/password-reset", {
        method: "POST",
        auth: false,
        body,
      });
      haptic.success();
      setSentTo(email.trim().toLowerCase());
    } catch (e) {
      haptic.warning();
      setToken(null);
      setChallengeReset((n) => n + 1);
      setError(e instanceof ApiError ? e.message : MESSAGES.unavailable);
    } finally {
      setPending(false);
    }
  };

  if (sentTo) {
    return (
      <>
        <Stack.Screen options={{ title: "Reset password" }} />
        <FormScreen>
          <Text size="xl" weight="semibold" accessibilityRole="header">
            Check your email
          </Text>
          <Text tone="muted">
            If an account exists for <Text weight="medium">{sentTo}</Text>, a
            link to reset its password is on the way. The link works once and
            expires in 1 hour.
          </Text>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <Text tone="muted">
              Nothing after a few minutes? Check spam, or{" "}
            </Text>
            <Button
              label="send it again"
              variant="text"
              onPress={() => {
                setSentTo(null);
                setToken(null);
                setChallengeReset((n) => n + 1);
              }}
            />
          </View>
          <Button
            label="Back to sign in"
            variant="secondary"
            onPress={() => router.back()}
          />
        </FormScreen>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "Reset password" }} />
      <FormScreen>
        <Text tone="muted">
          Enter your account&apos;s email and we&apos;ll send a reset link.
        </Text>
        <TextField
          label="Email"
          value={email}
          onChangeText={(t) => {
            setEmail(t);
            setError(null);
          }}
          keyboardType="email-address"
          textContentType="username"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="send"
          onSubmitEditing={submit}
        />
        {challenge && challengeUsable ? (
          <BotChallenge
            config={{ siteKey: challenge.siteKey!, origin: challenge.origin! }}
            onToken={setToken}
            resetKey={challengeReset}
          />
        ) : null}
        {!challengeUsable ? (
          <Banner message="Password reset isn't available in the app right now. Use the web." />
        ) : null}
        {error ? <Banner message={error} /> : null}
        <Button
          label="Send reset link"
          onPress={submit}
          loading={pending}
          disabled={!challengeUsable || (challenge !== null && !token)}
        />
      </FormScreen>
    </>
  );
}
