import { useEffect, useRef, useState } from "react";
import { Alert, View } from "react-native";
import { Stack, router, usePreventRemove } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { USERNAME_HELP } from "@overload/shared/accounts/validation";
import {
  applySavedProfile,
  useProfile,
  useUpdateProfile,
} from "../api/account";
import { useMe } from "../api/queries";
import { ApiError } from "../api/errors";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { FormScreen } from "../ui/FormScreen";
import { GroupedList, ListRow } from "../ui/GroupedList";
import { haptic } from "../ui/haptics";
import { LoadErrorState } from "../ui/LoadErrorState";
import { SkeletonCard } from "../ui/Skeleton";
import { Text } from "../ui/Text";
import { TextField, type TextInputHandle } from "../ui/TextField";
import { useTheme } from "../ui/ThemeProvider";
import { changeFailureMessage } from "../workout/messages";
import {
  checkProfile,
  fieldErrorsFrom,
  isDirty,
  takePickedTimeZone,
  usePickedTimeZone,
  type ProfileDraft,
  type ProfileErrors,
} from "./profile-model";

/** The account's email can't change here, and the password goes by email. */
export const EMAIL_FOOTNOTE = "Your email can't be changed here.";
export const PASSWORD_FOOTNOTE =
  "To change your password, sign out and choose Forgot password.";

/**
 * A1 Profile (Pitch 21j design §6 A1, §15; RD-2). Names, username, and time
 * zone, saved together through the web's `updateProfile`. Save is enabled
 * only when something changed; a failure keeps every typed value; leaving
 * with unsaved changes asks first.
 */
export function ProfileScreen() {
  const query = useProfile();
  const view = query.data;
  if (!view) {
    return (
      <Shell>
        {query.isError ? (
          <LoadErrorState
            error={query.error}
            subject="Your profile"
            request="GET /me/profile"
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
          />
        ) : (
          <SkeletonCard rows={5} />
        )}
      </Shell>
    );
  }
  return <ProfileForm saved={view.profile} />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Stack.Screen options={{ title: "Profile" }} />
      <FormScreen>{children}</FormScreen>
    </>
  );
}

function ProfileForm({ saved }: { saved: ProfileDraft }) {
  const { spacing } = useTheme();
  const client = useQueryClient();
  const me = useMe(true);
  const update = useUpdateProfile();
  const [baseline, setBaseline] = useState<ProfileDraft>(saved);
  const [draft, setDraft] = useState<ProfileDraft>(saved);
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const lastRef = useRef<TextInputHandle>(null);
  const usernameRef = useRef<TextInputHandle>(null);
  const dirty = isDirty(draft, baseline);
  const saving = update.isPending;

  // A zone chosen on A2 comes back into this draft (saved with Save). Taken
  // during render, React's pattern for state that follows an outside change.
  const picked = usePickedTimeZone();
  if (picked !== null) {
    const zone = takePickedTimeZone();
    if (zone && zone !== draft.timeZone) {
      setDraft((d) => ({ ...d, timeZone: zone }));
      setErrors((e) => ({ ...e, timeZone: undefined }));
      setJustSaved(false);
    }
  }

  // Leaving with unsaved changes asks first (design A1).
  usePreventRemove(dirty && !saving, ({ repeat }) => {
    Alert.alert("Discard your changes?", undefined, [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: repeat },
    ]);
  });

  useEffect(() => {
    if (!justSaved) return;
    const t = setTimeout(() => setJustSaved(false), 4000);
    return () => clearTimeout(t);
  }, [justSaved]);

  const set = (field: keyof ProfileDraft) => (text: string) => {
    setDraft((d) => ({ ...d, [field]: text }));
    setErrors((e) => ({ ...e, [field]: undefined }));
    setJustSaved(false);
  };

  async function save() {
    if (saving || !dirty) return;
    const early = checkProfile(draft, baseline);
    if (Object.keys(early).length > 0) {
      setErrors(early);
      void haptic.warning();
      return;
    }
    setErrors({});
    setFailure(null);
    try {
      const { profile } = await update.mutateAsync(draft);
      applySavedProfile(client, profile, baseline.timeZone);
      setBaseline(profile);
      setDraft(profile);
      setJustSaved(true);
      void haptic.success();
    } catch (error) {
      void haptic.warning();
      const fields = fieldErrorsFrom(
        error instanceof ApiError ? error.details : undefined,
      );
      if (Object.keys(fields).length > 0) {
        setErrors(fields);
      } else if (
        error instanceof ApiError &&
        error.code === "conflict" &&
        /username/i.test(error.message)
      ) {
        setErrors({ username: error.message });
      } else {
        setFailure(
          changeFailureMessage(
            error,
            "save",
            "Your changes are still here.",
          ).replace(/^Couldn't save — /, "Couldn't save. "),
        );
      }
    }
  }

  const email = me.data?.email;
  return (
    <>
      <Stack.Screen options={{ title: "Profile" }} />
      <FormScreen>
        {failure ? <Banner message={failure} /> : null}
        <TextField
          label="First name"
          value={draft.firstName}
          textContentType="givenName"
          autoComplete="given-name"
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="next"
          editable={!saving}
          error={errors.firstName ?? null}
          onSubmitEditing={() => lastRef.current?.focus()}
          onChangeText={set("firstName")}
        />
        <TextField
          ref={lastRef}
          label="Last name"
          value={draft.lastName}
          textContentType="familyName"
          autoComplete="family-name"
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="next"
          editable={!saving}
          error={errors.lastName ?? null}
          onSubmitEditing={() => usernameRef.current?.focus()}
          onChangeText={set("lastName")}
        />
        <TextField
          ref={usernameRef}
          label="Username"
          value={draft.username}
          hint={USERNAME_HELP}
          textContentType="username"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="ascii-capable"
          returnKeyType="done"
          editable={!saving}
          error={errors.username ?? null}
          onChangeText={set("username")}
        />
        <GroupedList
          header="Time zone"
          footer={
            errors.timeZone ?? "Overload uses this to decide what today is."
          }
        >
          <ListRow
            title="Time zone"
            value={draft.timeZone}
            accessory="chevron"
            accessibilityHint="Choose the time zone"
            onPress={() =>
              router.push(
                `/more/time-zone?current=${encodeURIComponent(draft.timeZone)}`,
              )
            }
          />
        </GroupedList>
        <GroupedList header="Account">
          <ListRow
            title="Email"
            value={
              email
                ? `${email}${me.data?.emailVerified ? " ✓" : ""}`
                : undefined
            }
          />
        </GroupedList>
        <View style={{ gap: spacing.xs }}>
          <Text size="sm" tone="muted">
            {EMAIL_FOOTNOTE}
          </Text>
          <Text size="sm" tone="muted">
            {PASSWORD_FOOTNOTE}
          </Text>
        </View>
        <Button
          label={saving ? "Saving…" : "Save"}
          loading={saving}
          disabled={!dirty}
          onPress={() => void save()}
        />
        {justSaved ? (
          <Text
            size="sm"
            tone="muted"
            align="center"
            accessibilityLiveRegion="polite"
          >
            Saved
          </Text>
        ) : null}
      </FormScreen>
    </>
  );
}
