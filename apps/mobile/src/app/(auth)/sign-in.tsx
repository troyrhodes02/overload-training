import { useRef, useState } from "react";
import { View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import {
  SIGN_IN_UNAVAILABLE,
  signInErrorMessage,
} from "@overload/shared/accounts/auth-errors";
import { useSession } from "../../auth/session";
import { Banner } from "../../ui/Banner";
import { Button } from "../../ui/Button";
import { FormScreen } from "../../ui/FormScreen";
import { haptic } from "../../ui/haptics";
import { TextField, type TextInputHandle } from "../../ui/TextField";

/**
 * S2 Sign in (design §6, §15). Supabase Auth directly: the anon key can
 * sign in but never create an account. The refusal messages are the web's,
 * from the shared package. A failure keeps the typed email.
 */
export default function SignInScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const { signInWithPassword } = useSession();
  const [email, setEmail] = useState(
    typeof params.email === "string" ? params.email : "",
  );
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const passwordRef = useRef<TextInputHandle>(null);

  const submit = async () => {
    if (pending) return;
    const trimmed = email.trim();
    if (!trimmed || !password) {
      setError("Enter your email and password.");
      haptic.warning();
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await signInWithPassword(trimmed, password);
      if (result.ok) {
        haptic.success();
        // The gate moves to the tabs once `me` loads.
      } else {
        setError(signInErrorMessage(result.error));
        setPassword("");
        haptic.warning();
      }
    } catch {
      setError(SIGN_IN_UNAVAILABLE);
      haptic.warning();
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: "Sign in" }} />
      <FormScreen>
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          textContentType="username"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          submitBehavior="submit"
        />
        <TextField
          ref={passwordRef}
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="password"
          autoComplete="current-password"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        <View style={{ alignItems: "flex-end" }}>
          <Button
            label="Forgot password?"
            variant="text"
            onPress={() =>
              router.push({
                pathname: "/reset-password",
                params: { email: email.trim() },
              })
            }
          />
        </View>
        {error ? <Banner message={error} /> : null}
        <Button label="Sign in" onPress={submit} loading={pending} />
      </FormScreen>
    </>
  );
}
