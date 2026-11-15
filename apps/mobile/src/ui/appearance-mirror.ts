import * as SecureStore from "expo-secure-store";
import {
  APPEARANCE_STORAGE_KEY,
  type Appearance,
} from "@overload/shared/appearance/appearance";

/**
 * The per-device first-paint mirror of the appearance preference (design §3,
 * the same rule as the web's localStorage key). A value, not a secret, but
 * the Keychain avoids adding a second storage library for one key (B8).
 */
export async function readAppearanceMirror(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(APPEARANCE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeAppearanceMirror(value: Appearance): void {
  SecureStore.setItemAsync(APPEARANCE_STORAGE_KEY, value).catch(() => {});
}
