import { File } from "expo-file-system";

/**
 * Local image files the screenshot flow makes (Pitch 21j review #4): the
 * picker's copy and the re-encoded JPEG. They hold whatever the screenshot
 * showed, so each is deleted as soon as it isn't needed. Best effort: never
 * throws (a leftover in the app's own cache is the OS's to purge).
 */
export function deleteLocalImage(uri: string | null | undefined): void {
  if (!uri || !uri.startsWith("file://")) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Nothing more to do.
  }
}
