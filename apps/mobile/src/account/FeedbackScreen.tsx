import { useEffect, useRef, useState } from "react";
import { Alert, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { isFeedbackCategory } from "@overload/shared/feedback/validation";
import type { FeedbackFieldErrors } from "@overload/shared/feedback/validation";
import { useSubmitFeedback } from "../api/account";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { ChipGroup } from "../ui/ChipGroup";
import { FormScreen } from "../ui/FormScreen";
import { haptic } from "../ui/haptics";
import { StateView } from "../ui/StateView";
import { Text } from "../ui/Text";
import { TextField } from "../ui/TextField";
import { useModalClose } from "../ui/use-modal-close";
import { useTheme } from "../ui/ThemeProvider";
import {
  CATEGORY_OPTIONS,
  canSend,
  checkFeedback,
  hasDraft,
  messageCounter,
  resetFeedbackDraft,
  sendFailure,
  updateFeedbackDraft,
  useFeedbackDraft,
} from "./feedback-model";

/**
 * A6 Send feedback (Pitch 21j design §6 A6, §15; RD-10, RD-11): a category
 * and a message to the owner's existing inbox. One tap is one submission —
 * the draft's retry key makes a repeated tap or an automatic retry arrive
 * once. A failure keeps the draft; Cancel with a draft asks first.
 *
 * `attachment` is where the screenshot row goes once the native image picker
 * is in the installed build (RD-9); without it the message sends text only.
 */
export function FeedbackScreen({
  attachment,
}: {
  attachment?: React.ReactNode;
}) {
  const { spacing } = useTheme();
  const close = useModalClose();
  const params = useLocalSearchParams<{ category?: string }>();
  const draft = useFeedbackDraft();
  const submit = useSubmitFeedback();
  const [errors, setErrors] = useState<FeedbackFieldErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const sending = useRef(false);

  // A7's "Send feedback" opens on Question when nothing is chosen yet.
  useEffect(() => {
    if (draft.category === null && isFeedbackCategory(params.category)) {
      updateFeedbackDraft({ category: params.category });
    }
    // Only on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send() {
    if (sending.current || !canSend(draft)) return;
    const early = checkFeedback(draft);
    if (early.category || early.message) {
      setErrors(early);
      void haptic.warning();
      return;
    }
    sending.current = true;
    setErrors({});
    setBanner(null);
    try {
      await submit.mutateAsync({
        key: draft.key,
        category: draft.category as string,
        message: draft.message,
        screenshot: draft.screenshot,
      });
      resetFeedbackDraft();
      setSent(true);
      void haptic.success();
    } catch (error) {
      void haptic.warning();
      const failure = sendFailure(error);
      setErrors(failure.fields);
      setBanner(failure.banner);
    } finally {
      sending.current = false;
    }
  }

  const cancel = () => {
    if (!hasDraft(draft) || sent) return close();
    Alert.alert("Discard this feedback?", undefined, [
      { text: "Keep editing", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: () => {
          resetFeedbackDraft();
          close();
        },
      },
    ]);
  };

  if (sent) {
    return (
      <>
        <Stack.Screen
          options={{
            title: "Send feedback",
            headerLeft: () => null,
            headerRight: () => (
              <Button label="Done" variant="text" onPress={close} />
            ),
          }}
        />
        <FormScreen>
          <StateView
            icon="checkmark.circle"
            title="Thanks — sent to the owner."
            action={{ label: "Done", onPress: close }}
          />
        </FormScreen>
      </>
    );
  }

  const pending = submit.isPending;
  return (
    <>
      <Stack.Screen
        options={{
          title: "Send feedback",
          headerLeft: () => (
            <Button
              label="Cancel"
              variant="text"
              accessibilityHint="Closes the form"
              onPress={cancel}
            />
          ),
        }}
      />
      <FormScreen>
        {banner ? <Banner message={banner} /> : null}
        <View style={{ gap: spacing.sm }}>
          <Text size="sm" weight="medium">
            What&apos;s it about?
          </Text>
          <ChipGroup
            label="What's it about?"
            options={CATEGORY_OPTIONS}
            selected={draft.category ? [draft.category] : []}
            disabled={pending}
            onToggle={(value) => {
              updateFeedbackDraft({ category: value });
              setErrors((e) => ({ ...e, category: undefined }));
            }}
          />
          {errors.category ? (
            <Text size="sm" tone="destructive">
              {errors.category}
            </Text>
          ) : null}
        </View>
        <View style={{ gap: spacing.xs }}>
          <TextField
            label="Message"
            value={draft.message}
            multiline
            numberOfLines={6}
            style={{ minHeight: 140, textAlignVertical: "top" }}
            editable={!pending}
            error={errors.message ?? null}
            onChangeText={(message) => {
              updateFeedbackDraft({ message });
              setErrors((e) => ({ ...e, message: undefined }));
            }}
          />
          <Text size="xs" tone="muted" align="right">
            {messageCounter(draft.message)}
          </Text>
        </View>
        {attachment}
        {errors.screenshots ? (
          <Text size="sm" tone="destructive">
            {errors.screenshots}
          </Text>
        ) : null}
        <Button
          label={pending ? "Sending…" : "Send"}
          loading={pending}
          disabled={!canSend(draft)}
          onPress={() => void send()}
        />
      </FormScreen>
    </>
  );
}
