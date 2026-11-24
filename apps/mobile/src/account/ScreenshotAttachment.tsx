import { useState } from "react";
import { Image, Linking, Modal, Pressable, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { File } from "expo-file-system";
import { deleteLocalImage } from "./screenshot-files";
import { Button } from "../ui/Button";
import { Symbol } from "../ui/Symbol";
import { Text } from "../ui/Text";
import { useTheme } from "../ui/ThemeProvider";
import { updateFeedbackDraft, useFeedbackDraft } from "./feedback-model";
import {
  ATTACH_FAILED,
  ATTACH_NOTE,
  JPEG_COMPRESS,
  fitsUpload,
  resizeFor,
} from "./screenshot-model";

export type PreparedScreenshot = { uri: string; name: string; type: string };

/**
 * Pick one image the lifter chooses (never a capture of the screen), then
 * re-encode it as a JPEG no larger than 2,048 px, which also strips EXIF
 * (RD-10). Null when the lifter cancels the picker.
 */
export async function pickScreenshot(): Promise<
  PreparedScreenshot | null | "denied" | "failed"
> {
  let picked: ImagePicker.ImagePickerResult;
  try {
    picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: false,
      quality: 1,
      exif: false,
    });
  } catch {
    const perm = await ImagePicker.getMediaLibraryPermissionsAsync().catch(
      () => null,
    );
    return perm && perm.status === "denied" ? "denied" : "failed";
  }
  if (picked.canceled || !picked.assets?.[0]) return null;
  const asset = picked.assets[0];
  // The picker's own copy (possibly the original, with its metadata) is
  // deleted however preparation ends (review #4).
  try {
    const context = ImageManipulator.manipulate(asset.uri);
    const resize = resizeFor(asset.width, asset.height);
    if (resize) context.resize(resize);
    const image = await context.renderAsync();
    const saved = await image.saveAsync({
      format: SaveFormat.JPEG,
      compress: JPEG_COMPRESS,
    });
    let size: number | null = null;
    try {
      size = new File(saved.uri).size ?? null;
    } catch {
      size = null;
    }
    if (!fitsUpload(size)) {
      deleteLocalImage(saved.uri);
      return "failed";
    }
    return { uri: saved.uri, name: "screenshot.jpg", type: "image/jpeg" };
  } catch {
    return "failed";
  } finally {
    deleteLocalImage(asset.uri);
  }
}

/**
 * A6's Screenshot row (Pitch 21j design §6 A6, §15): add, review full
 * screen, replace, or remove one screenshot. The choice is part of the draft,
 * so a failed send keeps it.
 */
export function ScreenshotAttachment({
  pick = pickScreenshot,
  disabled = false,
}: {
  pick?: typeof pickScreenshot;
  disabled?: boolean;
}) {
  const { colors, radius, spacing } = useTheme();
  const { screenshot } = useFeedbackDraft();
  const [preparing, setPreparing] = useState(false);
  const [problem, setProblem] = useState<"failed" | "denied" | null>(null);
  const [reviewing, setReviewing] = useState(false);

  async function choose() {
    if (preparing || disabled) return;
    setProblem(null);
    setPreparing(true);
    try {
      const result = await pick();
      if (result === "failed" || result === "denied") setProblem(result);
      else if (result) updateFeedbackDraft({ screenshot: result });
    } finally {
      setPreparing(false);
    }
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <Text size="sm" weight="medium">
        Screenshot
      </Text>
      {screenshot ? (
        <View
          style={{
            flexDirection: "row",
            gap: spacing.md,
            alignItems: "center",
            padding: spacing.md,
            backgroundColor: colors.card,
            borderRadius: radius.xl,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Pressable
            accessibilityRole="imagebutton"
            accessibilityLabel="Review the attached screenshot"
            onPress={() => setReviewing(true)}
          >
            <Image
              source={{ uri: screenshot.uri }}
              style={{
                width: 56,
                height: 112,
                borderRadius: radius.md,
                backgroundColor: colors.muted,
              }}
              resizeMode="cover"
            />
          </Pressable>
          <View style={{ flex: 1, gap: spacing.sm }}>
            <Text>Screenshot attached</Text>
            <View style={{ flexDirection: "row", gap: spacing.lg }}>
              <Button
                label="Replace"
                variant="text"
                size="md"
                disabled={disabled || preparing}
                onPress={() => void choose()}
              />
              <Button
                label="Remove"
                variant="destructive-text"
                size="md"
                disabled={disabled || preparing}
                onPress={() => updateFeedbackDraft({ screenshot: null })}
              />
            </View>
          </View>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add a screenshot"
          accessibilityState={{
            disabled: disabled || preparing,
            busy: preparing,
          }}
          disabled={disabled || preparing}
          onPress={() => void choose()}
          style={({ pressed }) => ({
            minHeight: 48,
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.sm,
            paddingHorizontal: spacing.lg,
            backgroundColor: colors.card,
            borderRadius: radius.xl,
            borderWidth: 1,
            borderColor: colors.border,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Symbol name="photo" size={18} color={colors.mutedForeground} />
          <Text tone={preparing ? "muted" : "primary"}>
            {preparing ? "Preparing the screenshot…" : "Add a screenshot"}
          </Text>
        </Pressable>
      )}
      {problem === "failed" ? (
        <Text size="sm" tone="destructive">
          {ATTACH_FAILED}
        </Text>
      ) : problem === "denied" ? (
        <View style={{ gap: spacing.xs }}>
          <Text size="sm" tone="destructive">
            Overload can&apos;t open your photos. You can allow it in Settings.
          </Text>
          <Button
            label="Open Settings"
            variant="text"
            size="md"
            onPress={() => void Linking.openSettings()}
          />
        </View>
      ) : null}
      <Text size="xs" tone="muted">
        {ATTACH_NOTE}
      </Text>
      <Modal
        visible={reviewing && screenshot !== null}
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={() => setReviewing(false)}
      >
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          {screenshot ? (
            <Image
              source={{ uri: screenshot.uri }}
              style={{ flex: 1 }}
              resizeMode="contain"
              accessibilityLabel="The attached screenshot"
            />
          ) : null}
          <View style={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
            <Button label="Done" onPress={() => setReviewing(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}
