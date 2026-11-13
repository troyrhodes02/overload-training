import type { SupabaseClient } from "@supabase/supabase-js";
import {
  storageErrorStatus,
  supabaseImageStore,
} from "../../prisma/seed/adapters";

/**
 * The Supabase Storage adapter used by the catalog import, against a fake
 * client that mimics storage-js's documented result shapes. A missing object is
 * `{ data: false, error }` (status 400/404) — it must read as "not stored", not
 * as a failure, or every image on a fresh bucket would be reported as failed.
 */
type Fake = {
  getBucket: jest.Mock;
  createBucket: jest.Mock;
  exists: jest.Mock;
  upload: jest.Mock;
};

function client(fake: Fake): SupabaseClient {
  return {
    storage: {
      getBucket: fake.getBucket,
      createBucket: fake.createBucket,
      from: () => ({ exists: fake.exists, upload: fake.upload }),
    },
  } as unknown as SupabaseClient;
}

function fake(overrides: Partial<Fake> = {}): Fake {
  return {
    getBucket: jest.fn(),
    createBucket: jest.fn().mockResolvedValue({ data: {}, error: null }),
    exists: jest.fn(),
    upload: jest.fn(),
    ...overrides,
  };
}

const apiError = (status: number, message: string) =>
  Object.assign(new Error(message), { status });

describe("supabaseImageStore", () => {
  it("treats a 400/404 'missing' result as not stored, and true as stored", async () => {
    const f = fake();
    const store = supabaseImageStore(client(f));
    f.exists.mockResolvedValueOnce({ data: false, error: apiError(400, "") });
    await expect(store.exists("a/0.jpg")).resolves.toBe(false);
    f.exists.mockResolvedValueOnce({
      data: false,
      error: apiError(404, "Object not found"),
    });
    await expect(store.exists("a/0.jpg")).resolves.toBe(false);
    f.exists.mockResolvedValueOnce({ data: true, error: null });
    await expect(store.exists("a/0.jpg")).resolves.toBe(true);
  });

  it("lets unexpected exists() failures surface (recorded as image failures)", async () => {
    const f = fake({
      exists: jest.fn().mockRejectedValue(apiError(500, "boom")),
    });
    await expect(
      supabaseImageStore(client(f)).exists("a/0.jpg"),
    ).rejects.toThrow("boom");
  });

  it("uploads without overwriting and reports an existing object", async () => {
    const f = fake();
    const store = supabaseImageStore(client(f));
    f.upload.mockResolvedValueOnce({ data: {}, error: null });
    await expect(
      store.upload("a/0.jpg", new Uint8Array([1]), "image/jpeg"),
    ).resolves.toBe("uploaded");
    expect(f.upload.mock.calls[0][2]).toMatchObject({
      upsert: false,
      contentType: "image/jpeg",
    });
    f.upload.mockResolvedValueOnce({
      data: null,
      error: apiError(409, "Duplicate"),
    });
    await expect(
      store.upload("a/0.jpg", new Uint8Array([1]), "image/jpeg"),
    ).resolves.toBe("already_exists");
    f.upload.mockResolvedValueOnce({
      data: null,
      error: apiError(413, "Payload too large"),
    });
    await expect(
      store.upload("a/0.jpg", new Uint8Array([1]), "image/jpeg"),
    ).rejects.toThrow(/Payload too large/);
  });

  it("creates the bucket public-read when missing", async () => {
    const f = fake({
      getBucket: jest.fn().mockResolvedValue({
        data: null,
        error: apiError(404, "Bucket not found"),
      }),
    });
    await supabaseImageStore(client(f)).ensurePublicBucket();
    expect(f.createBucket).toHaveBeenCalledWith(
      "exercise-images",
      expect.objectContaining({
        public: true,
        allowedMimeTypes: ["image/jpeg"],
      }),
    );
  });

  it("refuses a private bucket and never flips its posture", async () => {
    const f = fake({
      getBucket: jest
        .fn()
        .mockResolvedValue({ data: { public: false }, error: null }),
    });
    await expect(
      supabaseImageStore(client(f)).ensurePublicBucket(),
    ).rejects.toThrow(/PRIVATE/);
    expect(f.createBucket).not.toHaveBeenCalled();
  });

  it("accepts an existing public bucket and surfaces other read errors", async () => {
    const ok = fake({
      getBucket: jest
        .fn()
        .mockResolvedValue({ data: { public: true }, error: null }),
    });
    await supabaseImageStore(client(ok)).ensurePublicBucket();
    expect(ok.createBucket).not.toHaveBeenCalled();

    const broken = fake({
      getBucket: jest
        .fn()
        .mockResolvedValue({ data: null, error: apiError(500, "down") }),
    });
    await expect(
      supabaseImageStore(client(broken)).ensurePublicBucket(),
    ).rejects.toThrow(/down/);
  });

  it("reads status from either error shape", () => {
    expect(storageErrorStatus({ status: 404 })).toBe(404);
    expect(storageErrorStatus({ statusCode: "409" })).toBe(409);
    expect(storageErrorStatus(null)).toBeUndefined();
  });
});
