import type { ComponentType } from "react";
import { requireOptionalNativeModule } from "expo";

/**
 * Whether the installed build has the native image picker and manipulator
 * (OVE-252; review #5). A build from before them never loads the screenshot
 * code, so the feedback form sends text only instead of crashing.
 */
export function hasScreenshotModules(): boolean {
  return (
    requireOptionalNativeModule("ExponentImagePicker") !== null &&
    requireOptionalNativeModule("ExpoImageManipulator") !== null
  );
}

/** The Screenshot row, or null on a build without the native modules. */
export function loadScreenshotAttachment(
  available: () => boolean = hasScreenshotModules,
): ComponentType<{ disabled?: boolean }> | null {
  if (!available()) return null;
  // Required only when the native modules exist, so a build without them
  // never evaluates expo-image-picker.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("./ScreenshotAttachment").ScreenshotAttachment;
}
