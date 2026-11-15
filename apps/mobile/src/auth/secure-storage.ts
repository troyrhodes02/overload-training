import * as SecureStore from "expo-secure-store";

/**
 * supabase-js storage over the iOS Keychain (spec §11, RD-4). The only place
 * an auth token is ever written. No AsyncStorage or MMKV exists in the app
 * (boundary rule B8).
 *
 * A Supabase session can exceed SecureStore's recommended 2 KB per value, so
 * values are split into chunks under `${key}.${i}` with a `${key}.n` record
 * of "count:length". The writes go chunks first and the record last, and a
 * read whose chunks are missing or don't add up to the recorded length returns
 * null. So a write interrupted part-way (old record, some new chunks) reads as
 * signed out, never as a truncated or spliced session (review #3).
 */

export const CHUNK_SIZE = 1800;

export type KeyValueStore = {
  getItemAsync(
    key: string,
    options?: SecureStore.SecureStoreOptions,
  ): Promise<string | null>;
  setItemAsync(
    key: string,
    value: string,
    options?: SecureStore.SecureStoreOptions,
  ): Promise<void>;
  deleteItemAsync(
    key: string,
    options?: SecureStore.SecureStoreOptions,
  ): Promise<void>;
};

/** Readable after the first unlock, so a background token refresh works. */
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

const SAFE_KEY = /^[A-Za-z0-9._-]+$/;

export function createChunkedStorage(store: KeyValueStore = SecureStore) {
  const countKey = (key: string) => `${key}.n`;
  const chunkKey = (key: string, i: number) => `${key}.${i}`;
  const check = (key: string) => {
    if (!SAFE_KEY.test(key)) throw new Error("Unsupported storage key");
  };

  async function record(key: string): Promise<{ n: number; length: number }> {
    const raw = await store.getItemAsync(countKey(key), OPTIONS);
    const [n, length] = (raw ?? "").split(":").map(Number);
    return Number.isInteger(n) &&
      n > 0 &&
      Number.isInteger(length) &&
      length >= 0
      ? { n, length }
      : { n: 0, length: 0 };
  }
  const count = async (key: string) => (await record(key)).n;

  async function removeItem(key: string): Promise<void> {
    check(key);
    const n = await count(key);
    await store.deleteItemAsync(countKey(key), OPTIONS);
    for (let i = 0; i < n; i++) {
      await store.deleteItemAsync(chunkKey(key, i), OPTIONS);
    }
  }

  return {
    async getItem(key: string): Promise<string | null> {
      check(key);
      const { n, length } = await record(key);
      if (n === 0) return null;
      const parts: string[] = [];
      for (let i = 0; i < n; i++) {
        const part = await store.getItemAsync(chunkKey(key, i), OPTIONS);
        if (part === null) return null;
        parts.push(part);
      }
      const value = parts.join("");
      return value.length === length ? value : null;
    },
    async setItem(key: string, value: string): Promise<void> {
      check(key);
      const previous = await count(key);
      const chunks = Math.max(1, Math.ceil(value.length / CHUNK_SIZE));
      for (let i = 0; i < chunks; i++) {
        await store.setItemAsync(
          chunkKey(key, i),
          value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
          OPTIONS,
        );
      }
      await store.setItemAsync(
        countKey(key),
        `${chunks}:${value.length}`,
        OPTIONS,
      );
      for (let i = chunks; i < previous; i++) {
        await store.deleteItemAsync(chunkKey(key, i), OPTIONS);
      }
    },
    removeItem,
  };
}

export const secureStorage = createChunkedStorage();
