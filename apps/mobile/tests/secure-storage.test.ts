/** Pitch 21d spec §11: tokens only in the Keychain, chunked safely. */
import {
  CHUNK_SIZE,
  createChunkedStorage,
  type KeyValueStore,
} from "../src/auth/secure-storage";

function memory() {
  const map = new Map<string, string>();
  const store: KeyValueStore = {
    getItemAsync: async (k) => map.get(k) ?? null,
    setItemAsync: async (k, v) => {
      map.set(k, v);
    },
    deleteItemAsync: async (k) => {
      map.delete(k);
    },
  };
  return { map, store };
}

describe("chunked secure storage", () => {
  it("round-trips a long session across chunks and removes every chunk", async () => {
    const { map, store } = memory();
    const s = createChunkedStorage(store);
    const value = "x".repeat(CHUNK_SIZE * 2 + 17);
    await s.setItem("overload.auth", value);
    expect(map.get("overload.auth.n")).toBe("3");
    expect(await s.getItem("overload.auth")).toBe(value);
    await s.removeItem("overload.auth");
    expect([...map.keys()]).toEqual([]);
  });

  it("a shorter value deletes the stale chunks of a longer one", async () => {
    const { map, store } = memory();
    const s = createChunkedStorage(store);
    await s.setItem("k", "y".repeat(CHUNK_SIZE * 3));
    await s.setItem("k", "short");
    expect([...map.keys()].sort()).toEqual(["k.0", "k.n"]);
    expect(await s.getItem("k")).toBe("short");
  });

  it("a missing chunk reads as signed out, never as corrupt JSON", async () => {
    const { map, store } = memory();
    const s = createChunkedStorage(store);
    await s.setItem("k", "z".repeat(CHUNK_SIZE + 5));
    map.delete("k.1");
    expect(await s.getItem("k")).toBeNull();
    expect(await s.getItem("never-set")).toBeNull();
  });

  it("refuses keys the Keychain can't hold", async () => {
    const s = createChunkedStorage(memory().store);
    await expect(s.setItem("sb-abc:auth token", "v")).rejects.toThrow();
  });
});
