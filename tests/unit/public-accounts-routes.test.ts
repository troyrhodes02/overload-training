/**
 * PA3 (Public Accounts spec R9, §11) — the recovery/support/verify public
 * paths and the reintroduced `/auth/confirm` code-exchange callback.
 */

const verifyOtp = jest.fn();

jest.mock("@/lib/supabase/server", () => ({
  createServerSupabase: jest.fn(async () => ({
    auth: { verifyOtp },
  })),
}));

import { NextRequest } from "next/server";
import { isPublicPath, routeRedirect, PUBLIC_PATHS } from "@/lib/auth-routes";
import { GET } from "@/app/auth/confirm/route";
import {
  supportEmail,
  SUPPORT_EMAIL_PLACEHOLDER,
} from "@/lib/accounts/support-email";

describe("public paths (PA3 / R9)", () => {
  const newDoors = [
    "/forgot-password",
    "/reset-password",
    "/support",
    "/auth/confirm",
    "/verify-email",
  ];

  it.each([...newDoors, "/login", "/signup"])(
    "%s is public and reachable signed-out",
    (path) => {
      expect(isPublicPath(path)).toBe(true);
      expect(routeRedirect(path, false)).toBeNull();
    },
  );

  it("exports exactly the expected public path set", () => {
    expect([...PUBLIC_PATHS].sort()).toEqual(
      ["/login", "/signup", ...newDoors].sort(),
    );
  });

  it.each(["/", "/settings", "/plan", "/goals", "/admin", "/loginx"])(
    "%s still requires an auth session",
    (path) => {
      expect(isPublicPath(path)).toBe(false);
      expect(routeRedirect(path, false)).toBe("/login");
    },
  );

  it("still bounces a signed-in visitor off the sign-in doors only", () => {
    expect(routeRedirect("/login", true)).toBe("/");
    expect(routeRedirect("/signup", true)).toBe("/");
  });

  it("lets a signed-in visitor stay on recovery/support/verify paths", () => {
    // A verify link followed from Settings, or /support opened while signed in,
    // must not bounce to Today.
    for (const path of newDoors) {
      expect(routeRedirect(path, true)).toBeNull();
    }
  });

  it("matches sub-paths too (startsWith segment boundary)", () => {
    expect(isPublicPath("/auth/confirm/extra")).toBe(true);
    expect(isPublicPath("/supporting")).toBe(false); // not a segment boundary
  });
});

describe("GET /auth/confirm (PA3 / R3)", () => {
  function request(query: string): NextRequest {
    return new NextRequest(`http://127.0.0.1:3000/auth/confirm${query}`);
  }

  function location(res: Response): string {
    return (
      new URL(res.headers.get("location") as string).pathname +
      new URL(res.headers.get("location") as string).search
    );
  }

  beforeEach(() => {
    verifyOtp.mockReset();
  });

  it("recovery: a valid token exchanges and lands on /reset-password", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    const res = await GET(request("?token_hash=abc&type=recovery"));
    expect(verifyOtp).toHaveBeenCalledWith({
      type: "recovery",
      token_hash: "abc",
    });
    expect(res.status).toBe(303);
    expect(location(res)).toBe("/reset-password");
  });

  it.each(["email", "signup", "email_change"])(
    "verify (%s): a valid token lands on /verify-email",
    async (type) => {
      verifyOtp.mockResolvedValue({ error: null });
      const res = await GET(request(`?token_hash=tok&type=${type}`));
      expect(verifyOtp).toHaveBeenCalledWith({ type, token_hash: "tok" });
      expect(location(res)).toBe("/verify-email");
    },
  );

  it("recovery: an invalid/expired token lands on the recovery expired state", async () => {
    verifyOtp.mockResolvedValue({ error: { message: "expired" } });
    const res = await GET(request("?token_hash=stale&type=recovery"));
    expect(location(res)).toBe("/forgot-password?link=expired");
  });

  it("verify: an invalid/expired token lands on the verify expired state", async () => {
    verifyOtp.mockResolvedValue({ error: { message: "expired" } });
    const res = await GET(request("?token_hash=stale&type=email"));
    expect(location(res)).toBe("/verify-email?error=expired");
  });

  it("a thrown error never reaches an error page (recovery)", async () => {
    verifyOtp.mockRejectedValue(new Error("network"));
    const res = await GET(request("?token_hash=x&type=recovery"));
    expect(res.status).toBe(303);
    expect(location(res)).toBe("/forgot-password?link=expired");
  });

  it("a missing token never calls verifyOtp and routes to the expired state", async () => {
    const recovery = await GET(request("?type=recovery"));
    expect(location(recovery)).toBe("/forgot-password?link=expired");
    const verify = await GET(request("?type=email"));
    expect(location(verify)).toBe("/verify-email?error=expired");
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("an unknown or missing type defaults to the recovery expired door", async () => {
    const unknown = await GET(request("?token_hash=x&type=magiclink"));
    expect(location(unknown)).toBe("/forgot-password?link=expired");
    const none = await GET(request(""));
    expect(location(none)).toBe("/forgot-password?link=expired");
    expect(verifyOtp).not.toHaveBeenCalled();
  });
});

describe("supportEmail (PA3 / §11)", () => {
  const original = process.env.NEXT_PUBLIC_OVERLOAD_SUPPORT_EMAIL;
  afterEach(() => {
    if (original === undefined)
      delete process.env.NEXT_PUBLIC_OVERLOAD_SUPPORT_EMAIL;
    else process.env.NEXT_PUBLIC_OVERLOAD_SUPPORT_EMAIL = original;
  });

  it("returns the configured address, trimmed", () => {
    process.env.NEXT_PUBLIC_OVERLOAD_SUPPORT_EMAIL = "  help@overload.app  ";
    expect(supportEmail()).toBe("help@overload.app");
  });

  it("falls back to a visible placeholder when unset or blank", () => {
    delete process.env.NEXT_PUBLIC_OVERLOAD_SUPPORT_EMAIL;
    expect(supportEmail()).toBe(SUPPORT_EMAIL_PLACEHOLDER);
    process.env.NEXT_PUBLIC_OVERLOAD_SUPPORT_EMAIL = "   ";
    expect(supportEmail()).toBe(SUPPORT_EMAIL_PLACEHOLDER);
  });
});
