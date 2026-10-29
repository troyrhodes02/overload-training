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
  inviteInvalid: false,
  values: { firstName: "", lastName: "", username: "", email: "" },
};

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const filled = {
  firstName: "Sam",
  lastName: "Ortiz",
  username: "sam_lifts",
  email: "sam@example.com",
  password: "barbell-315",
  confirmPassword: "barbell-315",
  timeZone: "America/Chicago",
  inviteCode: "k7Qm-2xVr-9pLw",
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
      firstName: "Sam",
      lastName: "Ortiz",
      username: "sam_lifts",
      email: "sam@example.com",
      password: "barbell-315",
      confirmPassword: "barbell-315",
      timeZone: "America/Chicago",
      inviteCode: "k7Qm-2xVr-9pLw",
    });
  });

  it("keeps typed values but never echoes either password field", async () => {
    (signUp as jest.Mock).mockResolvedValue({ kind: "email_taken" });
    const state = await signUpAction(initial, form(filled));
    expect(state).toEqual({
      status: "error",
      fieldErrors: {},
      formError: "email_taken",
      inviteInvalid: false,
      values: {
        firstName: "Sam",
        lastName: "Ortiz",
        username: "sam_lifts",
        email: "sam@example.com",
      },
    });
    expect(JSON.stringify(state)).not.toContain("barbell-315");
  });

  it("surfaces field errors, closed, invite_invalid, and unexpected outcomes", async () => {
    (signUp as jest.Mock).mockResolvedValueOnce({
      kind: "invalid",
      fieldErrors: { username: "That username is taken." },
    });
    expect((await signUpAction(initial, form(filled))).fieldErrors).toEqual({
      username: "That username is taken.",
    });
    (signUp as jest.Mock).mockResolvedValueOnce({ kind: "closed" });
    expect((await signUpAction(initial, form(filled))).status).toBe("closed");
    // The wrong-invite result surfaces alone: inviteInvalid set, no field or
    // form error leaked.
    (signUp as jest.Mock).mockResolvedValueOnce({ kind: "invite_invalid" });
    const invite = await signUpAction(initial, form(filled));
    expect(invite).toMatchObject({
      status: "error",
      inviteInvalid: true,
      fieldErrors: {},
      formError: null,
    });
    (signUp as jest.Mock).mockResolvedValueOnce({ kind: "unexpected" });
    expect((await signUpAction(initial, form(filled))).formError).toBe(
      "unexpected",
    );
  });
});
