import { sniffImageType } from "@overload/shared/feedback/attachment-validation";

/** Pitch 21j RD-11 (audit F-A15): a screenshot's bytes decide its type. */
describe("sniffImageType", () => {
  const bytes = (...b: number[]) => new Uint8Array(b);
  const ascii = (t: string) => [...t].map((c) => c.charCodeAt(0));

  it("recognizes PNG, JPEG, and WebP by their magic bytes", () => {
    expect(
      sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0)),
    ).toBe("image/png");
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe1))).toBe("image/jpeg");
    expect(
      sniffImageType(
        bytes(...ascii("RIFF"), 1, 2, 3, 4, ...ascii("WEBP"), ...ascii("VP8 ")),
      ),
    ).toBe("image/webp");
  });

  it("refuses GIF, text, empty, and truncated headers", () => {
    expect(sniffImageType(bytes(...ascii("GIF89a")))).toBeNull();
    expect(sniffImageType(new TextEncoder().encode("<svg/>"))).toBeNull();
    expect(sniffImageType(bytes())).toBeNull();
    expect(sniffImageType(bytes(0x89, 0x50, 0x4e))).toBeNull();
    expect(sniffImageType(bytes(0xff, 0xd8))).toBeNull();
    expect(sniffImageType(bytes(...ascii("RIFF"), 0, 0, 0, 0))).toBeNull();
  });
});
