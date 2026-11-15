/** Pitch 21d spec §10.3 (RD-6): the embedded Turnstile challenge. */
import {
  challengeHtml,
  isAllowedChallengeUrl,
  parseChallengeMessage,
} from "../src/accounts/challenge";

describe("challenge messages", () => {
  it("accepts a token, an expiry, and an error; ignores anything else", () => {
    expect(parseChallengeMessage('{"type":"token","token":"abc"}')).toEqual({
      type: "token",
      token: "abc",
    });
    expect(parseChallengeMessage('{"type":"expired"}')).toEqual({
      type: "expired",
    });
    expect(parseChallengeMessage('{"type":"error"}')).toEqual({
      type: "error",
    });
    for (const bad of [
      "",
      "nope",
      "null",
      '{"type":"token"}',
      '{"type":"token","token":""}',
      '{"type":"other"}',
      `{"type":"token","token":"${"x".repeat(5000)}"}`,
    ]) {
      expect(parseChallengeMessage(bad)).toBeNull();
    }
  });
});

describe("challenge navigation allowlist", () => {
  const origin = "https://www.example.app";
  it("allows only the blank page, the page's origin, and Cloudflare", () => {
    expect(isAllowedChallengeUrl("about:blank", origin)).toBe(true);
    expect(isAllowedChallengeUrl(`${origin}/`, origin)).toBe(true);
    expect(
      isAllowedChallengeUrl(
        "https://challenges.cloudflare.com/cdn-cgi/challenge-platform/x",
        origin,
      ),
    ).toBe(true);
    for (const url of [
      "https://evil.example/",
      `${origin}.evil.example/`,
      "http://challenges.cloudflare.com/x",
      "javascript:alert(1)",
    ]) {
      expect(isAllowedChallengeUrl(url, origin)).toBe(false);
    }
  });
});

describe("challenge page", () => {
  it("embeds the site key and theme as JSON data, never as code", () => {
    const html = challengeHtml('key"};alert(1);//', "dark");
    expect(html).toContain(
      'var CONFIG={"sitekey":"key\\"};alert(1);//","theme":"dark"}',
    );
    expect(html).toContain(
      "https://challenges.cloudflare.com/turnstile/v0/api.js",
    );
    expect(html).not.toMatch(/secret/i);
  });
});
