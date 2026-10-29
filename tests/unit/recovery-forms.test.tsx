// Recovery UI contract (Public Accounts design Screens 2, 3, 5). Static markup
// only — effects (focus moves, the Turnstile widget) do not run under
// renderToStaticMarkup, so these assert the initial server state and the link
// wiring the design doc specifies.
jest.mock("@/app/login/actions", () => ({
  signInAction: jest.fn(),
  signOutAction: jest.fn(),
}));
jest.mock("@/app/forgot-password/actions", () => ({
  requestPasswordResetAction: jest.fn(),
}));
jest.mock("@/app/reset-password/actions", () => ({
  setNewPasswordAction: jest.fn(),
}));

import { renderToStaticMarkup } from "react-dom/server";
import { LoginForm } from "@/app/login/login-form";
import { ForgotPasswordForm } from "@/app/forgot-password/forgot-form";

describe("Login form (Screen 2 extended)", () => {
  it("renders a password-updated notice when passed", () => {
    const html = renderToStaticMarkup(
      <LoginForm notice="Password updated. Sign in with your new password." />,
    );
    expect(html).toContain("Password updated. Sign in with your new password.");
  });

  it("shows a Forgot password? link to /forgot-password", () => {
    const html = renderToStaticMarkup(<LoginForm notice={null} />);
    expect(html).toContain("Forgot password?");
    expect(html).toContain('href="/forgot-password"');
  });
});

describe("Forgot-password form (Screen 3)", () => {
  it("request state shows the heading, challenge gate, and Need help link", () => {
    const html = renderToStaticMarkup(
      <ForgotPasswordForm
        initialEmail=""
        linkExpired={false}
        turnstileSiteKey={null}
      />,
    );
    expect(html).toContain("Reset your password");
    expect(html).toContain("Send reset link");
    expect(html).toContain("Need help?");
    // No site key → the human check is unavailable and the button is disabled.
    expect(html).toContain("Couldn&#x27;t load the human check");
    expect(html).toContain("disabled");
  });

  it("arrived-from-expired-link shows the neutral alert above the form", () => {
    const html = renderToStaticMarkup(
      <ForgotPasswordForm
        initialEmail="will@example.com"
        linkExpired={true}
        turnstileSiteKey={null}
      />,
    );
    expect(html).toContain("That reset link has expired or was already used");
    // The typed email is prefilled for display.
    expect(html).toContain("will@example.com");
  });
});
