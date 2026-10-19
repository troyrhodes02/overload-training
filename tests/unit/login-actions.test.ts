const signInWithPassword = jest.fn();
const signOut = jest.fn();

jest.mock("@/lib/supabase/server", () => ({
  createServerSupabase: jest.fn(async () => ({
    auth: { signInWithPassword, signOut },
  })),
}));
jest.mock("@/lib/auth", () => ({
  requireUser: jest.fn(),
}));
jest.mock("next/navigation", () => ({
  redirect: jest.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

import { requireUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  signInAction,
  signOutAction,
  type SignInState,
} from "@/app/login/actions";
import { parseCredentials } from "@/app/login/credentials";

const initial: SignInState = { error: null, email: "" };

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("parseCredentials", () => {
  it("rejects empty fields", () => {
    expect(parseCredentials(form({ email: "", password: "" }))).toMatchObject({
      ok: false,
    });
  });
  it("accepts a filled form and trims the email", () => {
    expect(
      parseCredentials(form({ email: " a@b.co ", password: "pw" })),
    ).toEqual({ ok: true, email: "a@b.co", password: "pw" });
  });
});

describe("signInAction", () => {
  afterEach(() => jest.clearAllMocks());

  it("rejects empty fields without calling Supabase", async () => {
    const result = await signInAction(
      initial,
      form({ email: "", password: "" }),
    );
    expect(result.error).toMatch(/Enter your email and password/);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("returns a plain error on wrong credentials (no leak)", async () => {
    // The auth service's real shape for a wrong password AND an unknown email.
    signInWithPassword.mockResolvedValue({
      error: {
        message: "Invalid login credentials",
        code: "invalid_credentials",
        status: 400,
      },
    });
    const result = await signInAction(
      initial,
      form({ email: "a@b.co", password: "wrong" }),
    );
    expect(result).toEqual({
      error: "Wrong email or password.",
      email: "a@b.co",
    });
  });

  it("maps rate limiting and an unreachable auth service to their own messages", async () => {
    signInWithPassword.mockResolvedValueOnce({
      error: { code: "over_request_rate_limit", status: 429 },
    });
    expect(
      (await signInAction(initial, form({ email: "a@b.co", password: "x" })))
        .error,
    ).toBe("Too many attempts. Wait a minute and try again.");
    signInWithPassword.mockResolvedValueOnce({
      error: { name: "AuthRetryableFetchError", status: 0 },
    });
    expect(
      (await signInAction(initial, form({ email: "a@b.co", password: "x" })))
        .error,
    ).toBe("Couldn't sign in. Check your connection and try again.");
    signInWithPassword.mockRejectedValueOnce(new Error("fetch failed"));
    expect(
      (await signInAction(initial, form({ email: "a@b.co", password: "x" })))
        .error,
    ).toBe("Couldn't sign in. Check your connection and try again.");
  });

  it("redirects to / on success", async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    await expect(
      signInAction(initial, form({ email: "a@b.co", password: "right" })),
    ).rejects.toThrow("NEXT_REDIRECT:/");
    expect(redirect).toHaveBeenCalledWith("/");
  });
});

describe("signOutAction", () => {
  afterEach(() => jest.clearAllMocks());

  it("re-checks auth before signing out", async () => {
    (requireUser as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_REDIRECT:/login");
    });
    await expect(signOutAction()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(signOut).not.toHaveBeenCalled();
  });

  it("signs out and redirects to /login when authenticated", async () => {
    (requireUser as jest.Mock).mockResolvedValue({ id: "user-1" });
    signOut.mockResolvedValue({ error: null });
    await expect(signOutAction()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(signOut).toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/login");
  });
});
