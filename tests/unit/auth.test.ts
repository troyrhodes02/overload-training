jest.mock("@/lib/supabase/server", () => ({
  createServerSupabase: jest.fn(),
}));
jest.mock("next/navigation", () => ({
  redirect: jest.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

import { createServerSupabase } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getAuthUser, requireUser } from "@/lib/auth";

const mockedCreate = createServerSupabase as jest.MockedFunction<
  typeof createServerSupabase
>;

function supabaseReturning(user: unknown) {
  return {
    auth: { getUser: async () => ({ data: { user } }) },
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
});
