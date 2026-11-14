/** Pitch 21d review audit #5: the JSON body cap holds for chunked bodies. */
import { readJsonObject } from "@/lib/api/mobile/body";
import { ApiFailure } from "@/lib/api/mobile/errors";

function streamed(chunks: string[]): Request {
  const encoder = new TextEncoder();
  let pulled = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulled < chunks.length)
        controller.enqueue(encoder.encode(chunks[pulled++]));
      else controller.close();
    },
  });
  // No content-length: a chunked upload.
  return new Request("http://localhost/x", {
    method: "POST",
    body,
    duplex: "half",
  } as RequestInit);
}

describe("readJsonObject", () => {
  it("parses a small JSON object", async () => {
    expect(await readJsonObject(streamed(['{"a":', '"b"}']), 64)).toEqual({
      a: "b",
    });
  });

  it("stops reading a chunked body at the cap, without buffering the rest", async () => {
    let produced = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        produced++;
        controller.enqueue(new Uint8Array(1024));
        if (produced > 10_000) controller.close();
      },
    });
    const req = new Request("http://localhost/x", {
      method: "POST",
      body,
      duplex: "half",
    } as RequestInit);
    await expect(readJsonObject(req, 4096)).rejects.toBeInstanceOf(ApiFailure);
    expect(produced).toBeLessThan(20);
  });

  it("refuses a declared oversized body, non-JSON, and non-objects", async () => {
    const big = new Request("http://localhost/x", {
      method: "POST",
      headers: { "content-length": "999999" },
      body: "{}",
    });
    await expect(readJsonObject(big, 64)).rejects.toBeInstanceOf(ApiFailure);
    for (const text of ["nope", "[1]", "null", "42"]) {
      await expect(readJsonObject(streamed([text]), 64)).rejects.toMatchObject({
        code: "validation_error",
      });
    }
  });
});
