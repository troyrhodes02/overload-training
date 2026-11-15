/**
 * Where Supabase auth email links return (21d staging QA: a native password
 * reset link opened the landing page, because no redirectTo was sent).
 */
jest.mock("next/headers", () => ({
  headers: jest.fn(async () => {
    throw new Error("outside a request");
  }),
}));

import {
  authConfirmUrl,
  isAllowedRedirectHost,
  requestAuthConfirmUrl,
} from "@/lib/accounts/auth-redirect";
import { isAllowedRedirectHost as reexported } from "@/lib/accounts/verification";

const env = { NEXT_PUBLIC_APP_URL: "https://overloadtraining.app" };
const h = (entries: Record<string, string>) => new Headers(entries);

describe("authConfirmUrl", () => {
  it("returns /auth/confirm on the staging deployment the request reached", () => {
    expect(
      authConfirmUrl(
        h({
          "x-forwarded-host": "overload-training-git-staging-x.vercel.app",
          "x-forwarded-proto": "https",
        }),
        env,
      ),
    ).toBe("https://overload-training-git-staging-x.vercel.app/auth/confirm");
  });

  it("uses the configured production host", () => {
    expect(authConfirmUrl(h({ host: "overloadtraining.app" }), env)).toBe(
      "https://overloadtraining.app/auth/confirm",
    );
  });

  it("uses http for localhost", () => {
    expect(authConfirmUrl(h({ host: "localhost:3000" }), env)).toBe(
      "http://localhost:3000/auth/confirm",
    );
  });

  it("takes the first of a comma-separated forwarded host", () => {
    expect(
      authConfirmUrl(h({ "x-forwarded-host": "a.vercel.app, evil.com" }), env),
    ).toBe("https://a.vercel.app/auth/confirm");
  });

  it("never points a link at an unknown host: it falls back to the app URL", () => {
    for (const host of ["evil.com", "overloadtraining.app.evil.com", ""]) {
      expect(authConfirmUrl(h({ host }), env)).toBe(
        "https://overloadtraining.app/auth/confirm",
      );
    }
    expect(authConfirmUrl(null, env)).toBe(
      "https://overloadtraining.app/auth/confirm",
    );
  });

  it("ignores a forged protocol", () => {
    expect(
      authConfirmUrl(
        h({ host: "a.vercel.app", "x-forwarded-proto": "javascript" }),
        env,
      ),
    ).toBe("https://a.vercel.app/auth/confirm");
  });

  it("always ends at /auth/confirm, never the bare site root", () => {
    expect(authConfirmUrl(null, {})).toBe("http://localhost:3000/auth/confirm");
  });

  it("outside a request, the server helper still returns a confirm URL", async () => {
    expect(await requestAuthConfirmUrl()).toMatch(/\/auth\/confirm$/);
  });

  it("verification keeps the same allow-list", () => {
    expect(reexported).toBe(isAllowedRedirectHost);
  });
});
