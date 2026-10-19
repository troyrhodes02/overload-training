jest.mock("@/lib/supabase/server", () => ({
  createServerSupabase: jest.fn(),
}));
jest.mock("next/server", () => ({ connection: jest.fn(async () => {}) }));
jest.mock("next/navigation", () => ({
  redirect: jest.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

import { createServerSupabase } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getAuthUser, requireUser } from "@/lib/auth";

const mockedCreate = createServerSupabase as jest.MockedFunction<
  typeof createServerSupabase
>;

/** An unsigned JWT-shaped token carrying `amr` (only its payload is read). */
function tokenWithAmr(methods: string[]): string {
  const payload = Buffer.from(
    JSON.stringify({
      amr: methods.map((method) => ({ method, timestamp: 1_800_000_000 })),
    }),
  ).toString("base64url");
  return `header.${payload}.signature`;
}

function supabaseReturning(user: unknown, amr: string[] = ["password"]) {
  return {
    auth: {
      getUser: async () => ({ data: { user } }),
      getSession: async () => ({
        data: { session: user ? { access_token: tokenWithAmr(amr) } : null },
      }),
    },
  } as unknown as Awaited<ReturnType<typeof createServerSupabase>>;
}

describe("auth DAL", () => {
  afterEach(() => jest.clearAllMocks());

  it("getAuthUser returns the user when a session exists", async () => {
    mockedCreate.mockResolvedValue(supabaseReturning({ id: "user-1" }));
    await expect(getAuthUser()).resolves.toEqual({ id: "user-1" });
  });

  it("getAuthUser returns null when there is no session", async () => {
    mockedCreate.mockResolvedValue(supabaseReturning(null));
    await expect(getAuthUser()).resolves.toBeNull();
  });

  it("requireUser redirects to /login when unauthenticated", async () => {
    mockedCreate.mockResolvedValue(supabaseReturning(null));
    await expect(requireUser()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("requireUser returns the user when authenticated", async () => {
    mockedCreate.mockResolvedValue(supabaseReturning({ id: "user-1" }));
    await expect(requireUser()).resolves.toEqual({ id: "user-1" });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("a recovery-only session (reset link, no password sign-in) can only reach /reset-password (R26)", async () => {
    mockedCreate.mockResolvedValue(
      supabaseReturning({ id: "user-1" }, ["otp"]),
    );
    await expect(requireUser()).rejects.toThrow(
      "NEXT_REDIRECT:/reset-password",
    );
    // Sign-out is the one thing it may do.
    await expect(requireUser({ allowRecovery: true })).resolves.toEqual({
      id: "user-1",
    });
  });

  it("a session that signed in with a password is never treated as recovery-only", async () => {
    mockedCreate.mockResolvedValue(
      supabaseReturning({ id: "user-1" }, ["password", "otp"]),
    );
    await expect(requireUser()).resolves.toEqual({ id: "user-1" });
  });

  it("defers to request time (connection) before touching Supabase", async () => {
    const order: string[] = [];
    (connection as jest.Mock).mockImplementationOnce(async () => {
      order.push("connection");
    });
    mockedCreate.mockImplementationOnce(async () => {
      order.push("supabase");
      return supabaseReturning({ id: "user-1" });
    });
    await getAuthUser();
    expect(order).toEqual(["connection", "supabase"]);
  });
});
