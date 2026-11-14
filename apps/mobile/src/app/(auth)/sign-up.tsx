import { useRef, useState } from "react";
import { Linking, useWindowDimensions, View } from "react-native";
import { router, Stack } from "expo-router";
import {
  PASSWORD_MIN_LENGTH,
  USERNAME_HELP,
} from "@overload/shared/accounts/validation";
import type { SignUpRequest } from "@overload/shared/contracts/requests";
import type { SignUpResponseDto } from "@overload/shared/contracts/account";
import { useApi } from "../../api/ApiProvider";
import { ApiError, MESSAGES } from "../../api/errors";
import { useAppConfig } from "../../api/queries";
import { useSession } from "../../auth/session";
import { webOrigin } from "../../config/env";
import { Banner } from "../../ui/Banner";
import { BotChallenge } from "../../ui/BotChallenge";
import { Button } from "../../ui/Button";
import { FormScreen } from "../../ui/FormScreen";
import { haptic } from "../../ui/haptics";
import { Text } from "../../ui/Text";
import { TextField, type TextInputHandle } from "../../ui/TextField";

type Field =
  | "firstName"
  | "lastName"
  | "username"
  | "email"
  | "password"
  | "confirmPassword";
const FIELDS: Field[] = [
  "firstName",
  "lastName",
  "username",
  "email",
  "password",
  "confirmPassword",
];

/** The device's IANA zone; the server validates it and falls back if needed. */
function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
}

/**
 * S3 Create account (design §6, §15; spec §10.2). The web signup's fields, no
 * invite code. The server runs the web's own signUp with every defense and
 * returns the new account's session, which the app adopts. A failed submit
 * keeps every field and resets only the single-use challenge.
 */
export default function SignUpScreen() {
  const api = useApi();
  const { adoptSession } = useSession();
  const config = useAppConfig().data;
  const { width } = useWindowDimensions();
  const [values, setValues] = useState<Record<Field, string>>({
    firstName: "",
    lastName: "",
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<Field, string>>
  >({});
  const [formError, setFormError] = useState<{
    message: string;
    signIn?: boolean;
  } | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [challengeReset, setChallengeReset] = useState(0);
  const [pending, setPending] = useState(false);
  const refs = useRef<Partial<Record<Field, TextInputHandle | null>>>({});

  const challenge = config?.botChallenge ?? null;
  const challengeUsable =
    !challenge || (challenge.siteKey !== null && challenge.origin !== null);
  const needsToken = challenge !== null;
  const closed = config?.signupMode === "closed";

  const set = (field: Field) => (text: string) => {
    setValues((v) => ({ ...v, [field]: text }));
    setFieldErrors((e) => ({ ...e, [field]: undefined }));
  };
  const next = (field: Field) => {
    const i = FIELDS.indexOf(field);
    refs.current[FIELDS[i + 1]]?.focus();
  };

  const submit = async () => {
    if (pending || closed || !challengeUsable || (needsToken && !token)) return;
    const missing: Partial<Record<Field, string>> = {};
    if (!values.firstName.trim()) missing.firstName = "Enter your first name.";
    if (!values.lastName.trim()) missing.lastName = "Enter your last name.";
    if (!values.username.trim()) missing.username = "Choose a username.";
    if (!values.email.trim()) missing.email = "Enter your email.";
    if (!values.password) missing.password = "Enter a password.";
    else if (!values.confirmPassword)
      missing.confirmPassword = "Enter your password again.";
    if (Object.keys(missing).length > 0) {
      setFieldErrors(missing);
      haptic.warning();
      return;
    }
    setPending(true);
    setFormError(null);
    const body: SignUpRequest = {
      firstName: values.firstName,
      lastName: values.lastName,
      username: values.username,
      email: values.email.trim(),
      password: values.password,
      confirmPassword: values.confirmPassword,
      timeZone: deviceTimeZone(),
      challengeToken: token,
    };
    try {
      const result = await api.request<SignUpResponseDto>("/accounts", {
        method: "POST",
        auth: false,
        body,
      });
      if (await adoptSession(result.session)) {
        haptic.success();
      } else {
        // The account exists, and its challenge token is spent: send the
        // lifter to sign in with the email filled in, never back to a form
        // that would fail the challenge (review #4).
        setToken(null);
        router.replace({
          pathname: "/sign-in",
          params: { email: body.email },
        });
      }
    } catch (error) {
      haptic.warning();
      // A token is single-use: every failed submit gets a fresh challenge.
      setToken(null);
      setChallengeReset((n) => n + 1);
      if (!(error instanceof ApiError)) {
        setFormError({ message: MESSAGES.unavailable });
      } else if (
        error.code === "validation_error" &&
        Object.keys(error.details).length > 0
      ) {
        const { challengeToken, ...fields } = error.details;
        setFieldErrors(fields as Partial<Record<Field, string>>);
        if (challengeToken) setFormError({ message: challengeToken });
      } else if (error.code === "conflict") {
        setFieldErrors({ email: undefined });
        setFormError({
          message:
            "An account with this email already exists. Sign in instead.",
          signIn: true,
        });
      } else {
        setFormError({ message: error.message });
      }
    } finally {
      setPending(false);
    }
  };

  const twoUp = width >= 375;
  const field = (
    name: Field,
    label: string,
    extra: Partial<React.ComponentProps<typeof TextField>> = {},
  ) => (
    <TextField
      key={name}
      ref={(r) => {
        refs.current[name] = r;
      }}
      label={label}
      value={values[name]}
      onChangeText={set(name)}
      error={fieldErrors[name]}
      returnKeyType={name === "confirmPassword" ? "go" : "next"}
      onSubmitEditing={name === "confirmPassword" ? submit : () => next(name)}
      submitBehavior={name === "confirmPassword" ? "blurAndSubmit" : "submit"}
      {...extra}
    />
  );

  return (
    <>
      <Stack.Screen options={{ title: "Create account" }} />
      <FormScreen>
        {closed ? <Banner message="Signup isn't open right now." /> : null}
        <View style={{ flexDirection: twoUp ? "row" : "column", gap: 12 }}>
          <View style={{ flex: twoUp ? 1 : undefined }}>
            {field("firstName", "First name", {
              textContentType: "givenName",
              autoComplete: "given-name",
            })}
          </View>
          <View style={{ flex: twoUp ? 1 : undefined }}>
            {field("lastName", "Last name", {
              textContentType: "familyName",
              autoComplete: "family-name",
            })}
          </View>
        </View>
        {field("username", "Username", {
          autoCapitalize: "none",
          autoCorrect: false,
          keyboardType: "ascii-capable",
          textContentType: "nickname",
          hint: USERNAME_HELP,
        })}
        {field("email", "Email", {
          keyboardType: "email-address",
          autoCapitalize: "none",
          autoCorrect: false,
          textContentType: "emailAddress",
          autoComplete: "email",
        })}
        {field("password", "Password", {
          secureTextEntry: true,
          textContentType: "newPassword",
          autoComplete: "new-password",
          hint: `At least ${PASSWORD_MIN_LENGTH} characters.`,
        })}
        {field("confirmPassword", "Confirm password", {
          secureTextEntry: true,
          textContentType: "newPassword",
          autoComplete: "new-password",
        })}
        {challenge && challengeUsable ? (
          <BotChallenge
            config={{ siteKey: challenge.siteKey!, origin: challenge.origin! }}
            onToken={setToken}
            resetKey={challengeReset}
          />
        ) : null}
        {!challengeUsable ? (
          <Banner message="Signup isn't available in the app right now. Try again later or sign up on the web." />
        ) : null}
        {formError ? <Banner message={formError.message} /> : null}
        {formError?.signIn ? (
          <Button
            label="Sign in"
            variant="secondary"
            size="md"
            onPress={() =>
              router.replace({
                pathname: "/sign-in",
                params: { email: values.email.trim() },
              })
            }
          />
        ) : null}
        <Button
          label="Create account"
          onPress={submit}
          loading={pending}
          disabled={closed || !challengeUsable || (needsToken && !token)}
        />
        <View
          style={{
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            gap: 4,
          }}
        >
          <Text size="sm" tone="muted">
            Already have an account?
          </Text>
          <Button
            label="Sign in"
            variant="text"
            onPress={() => router.replace("/sign-in")}
          />
        </View>
        {!challengeUsable && webOrigin() ? (
          <Button
            label="Sign up on the web"
            variant="text"
            onPress={() => void Linking.openURL(`${webOrigin()}/signup`)}
          />
        ) : null}
      </FormScreen>
    </>
  );
}
