jest.mock("@/lib/accounts/signup", () => ({ signUp: jest.fn() }));
jest.mock("next/navigation", () => ({
  redirect: jest.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

import { signUp } from "@/lib/accounts/signup";
import { signUpAction, type SignUpState } from "@/app/signup/actions";

const initial: SignUpState = {
  status: "idle",
  fieldErrors: {},
  formError: null,
  values: { inviteCode: "", firstName: "", lastName: "", email: "" },
};

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const filled = {
  inviteCode: "k7Qm-2xVr-9pLw",
  firstName: "Sam",
  lastName: "Ortiz",
  email: "sam@example.com",
  password: "barbell-315",
  timeZone: "America/Chicago",
  // A client can post anything; it must be ignored.
  userId: "a0000000-0000-4000-8000-000000000001",
};

describe("signUpAction", () => {
  afterEach(() => jest.clearAllMocks());

  it("redirects to Today on success and passes no client-supplied id", async () => {
    (signUp as jest.Mock).mockResolvedValue({ kind: "created" });
    await expect(signUpAction(initial, form(filled))).rejects.toThrow(
      "NEXT_REDIRECT:/",
    );
    expect(signUp).toHaveBeenCalledWith({
      inviteCode: filled.inviteCode,
      firstName: "Sam",
      lastName: "Ortiz",
      email: "sam@example.com",
      password: "barbell-315",
      timeZone: "America/Chicago",
    });
  });

  it("keeps typed values but never echoes the password", async () => {
    (signUp as jest.Mock).mockResolvedValue({ kind: "email_taken" });
    const state = await signUpAction(initial, form(filled));
    expect(state).toEqual({
      status: "error",
      fieldErrors: {},
      formError: "email_taken",
      values: {
        inviteCode: filled.inviteCode,
        firstName: "Sam",
        lastName: "Ortiz",
        email: "sam@example.com",
      },
    });
    expect(JSON.stringify(state)).not.toContain("barbell-315");
  });

  it("surfaces field errors, closed, and unexpected outcomes", async () => {
    (signUp as jest.Mock).mockResolvedValueOnce({
      kind: "invalid",
      fieldErrors: { inviteCode: "That invite code isn't valid." },
    });
    expect((await signUpAction(initial, form(filled))).fieldErrors).toEqual({
      inviteCode: "That invite code isn't valid.",
    });
    (signUp as jest.Mock).mockResolvedValueOnce({ kind: "closed" });
    expect((await signUpAction(initial, form(filled))).status).toBe("closed");
    (signUp as jest.Mock).mockResolvedValueOnce({ kind: "unexpected" });
    expect((await signUpAction(initial, form(filled))).formError).toBe(
      "unexpected",
    );
  });
});
