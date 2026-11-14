/**
 * Pitch 21c (spec §15; RD-3): the proxy lets /api/mobile through without the
 * cookie redirect — and without even building the cookie Supabase client —
 * while every other path keeps its behavior. Authentication still happens in
 * the API's own request pipeline (mobile-api-pipeline.test.ts).
 */
const createServerClient = jest.fn();
jest.mock("@supabase/ssr", () => ({
  createServerClient: (...a: unknown[]) => createServerClient(...a),
}));

import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import {
  isMobileApiPath,
  isPublicPath,
  routeRedirect,
} from "@/lib/auth-routes";

describe("isMobileApiPath", () => {
  it.each(["/api/mobile", "/api/mobile/v1/me", "/api/mobile/v1/app-config"])(
    "%s is the mobile API",
    (p) => expect(isMobileApiPath(p)).toBe(true),
  );
  it.each([
    "/api/mobilex",
    "/api/mobile-app",
    "/api",
    "/mobile",
    "/api/stripe/webhook",
  ])("%s is not", (p) => expect(isMobileApiPath(p)).toBe(false));
});

describe("routeRedirect", () => {
  it("never redirects a signed-out mobile API request", () => {
    expect(routeRedirect("/api/mobile/v1/me", false)).toBeNull();
    expect(isPublicPath("/api/mobile/v1/today")).toBe(true);
  });

  it("still redirects lookalike and protected paths", () => {
    expect(routeRedirect("/api/mobilex", false)).toBe("/login");
    expect(routeRedirect("/settings", false)).toBe("/login");
    expect(routeRedirect("/history", false)).toBe("/login");
  });
});

describe("proxy", () => {
  beforeEach(() => {
    createServerClient.mockReset().mockReturnValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
    });
  });

  it("passes a mobile API request straight through, with no cookie client and no redirect", async () => {
    const res = await proxy(
      new NextRequest("http://localhost/api/mobile/v1/me", {
        headers: { authorization: "Bearer a.b.c" },
      }),
    );
    expect(createServerClient).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("still sends a signed-out web request to /login", async () => {
    const res = await proxy(new NextRequest("http://localhost/history"));
    expect(createServerClient).toHaveBeenCalled();
    expect(res.headers.get("location")).toBe("http://localhost/login");
  });
});
