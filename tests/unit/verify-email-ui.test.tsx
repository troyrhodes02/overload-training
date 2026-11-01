// Email-verification UI contract (Public Accounts design Screen 6, D1/D2/D8;
// OVE-85). The nudge reducer is pure and tested directly; the surfaces are
// asserted as static markup (effects / transitions do not run under
// renderToStaticMarkup).
jest.mock("@/app/(app)/settings/actions", () => ({
  sendVerificationEmailAction: jest.fn(),
}));

import { renderToStaticMarkup } from "react-dom/server";
import {
  nudgeReducer,
  VerifyEmailNudge,
  type NudgeState,
} from "@/components/settings/verify-email-nudge";
import { VerifyEmailConfirmation } from "@/app/verify-email/verify-email-confirmation";

describe("nudgeReducer (D1)", () => {
  it("starts and reflects send → sent", () => {
    expect(nudgeReducer("unverified", { type: "send" })).toBe("sent");
  });

  it("dismiss hides the unverified prompt for the session", () => {
    expect(nudgeReducer("unverified", { type: "dismiss" })).toBe("dismissed");
  });

  it("dismiss does not apply once sent (nothing to dismiss)", () => {
    expect(nudgeReducer("sent", { type: "dismiss" })).toBe("sent");
  });

  it("a re-send from the sent state stays sent", () => {
    expect(nudgeReducer("sent", { type: "send" })).toBe("sent");
  });

  it("reset returns to unverified (a failed send re-shows the prompt)", () => {
    expect(nudgeReducer("sent", { type: "reset" })).toBe("unverified");
  });

  it("ignores an unknown action", () => {
    const state: NudgeState = "unverified";
    expect(nudgeReducer(state, { type: "nope" } as never)).toBe(state);
  });
});

describe("VerifyEmailNudge (Screen 6, D2)", () => {
  it("verified shows only a quiet caption, no nudge, no button", () => {
    const html = renderToStaticMarkup(
      <VerifyEmailNudge email="will@example.com" verified />,
    );
    expect(html).toContain("Verified");
    expect(html).not.toContain("Send verification email");
    expect(html).not.toContain("isn&#x27;t verified");
  });

  it("unverified shows the dismissible prompt and the send button", () => {
    const html = renderToStaticMarkup(
      <VerifyEmailNudge email="will@example.com" verified={false} />,
    );
    expect(html).toContain("Send verification email");
    expect(html).toContain("Dismiss");
    // It is a neutral nudge, not blocking: no upgrade / countdown language.
    expect(html).not.toContain("Upgrade");
    expect(html).not.toContain("days left");
  });
});

describe("VerifyEmailConfirmation (Screen 6, D8)", () => {
  it("verified + signed in points to Today", () => {
    const html = renderToStaticMarkup(
      <VerifyEmailConfirmation
        state="verified"
        signedIn
        email="will@example.com"
      />,
    );
    expect(html).toContain("Email verified");
    expect(html).toContain("will@example.com is verified.");
    expect(html).toContain("Go to Today");
    expect(html).toContain('href="/"');
  });

  it("verified + signed out points to Sign in", () => {
    const html = renderToStaticMarkup(
      <VerifyEmailConfirmation
        state="verified"
        signedIn={false}
        email={null}
      />,
    );
    expect(html).toContain("Email verified");
    expect(html).toContain("Sign in");
    expect(html).toContain('href="/login"');
  });

  it("expired + signed in points to Settings", () => {
    const html = renderToStaticMarkup(
      <VerifyEmailConfirmation state="expired" signedIn email={null} />,
    );
    expect(html).toContain("This verification link has expired");
    expect(html).toContain("Open Settings and send a new one.");
    expect(html).toContain("Open Settings");
    expect(html).toContain('href="/settings"');
  });

  it("expired + signed out points to Sign in", () => {
    const html = renderToStaticMarkup(
      <VerifyEmailConfirmation state="expired" signedIn={false} email={null} />,
    );
    expect(html).toContain("This verification link has expired");
    expect(html).toContain('href="/login"');
  });
});
