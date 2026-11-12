// The signup form imports its server action; stub it so the form renders
// statically without a server runtime.
jest.mock("@/app/signup/actions", () => ({ signUpAction: jest.fn() }));

import { renderToStaticMarkup } from "react-dom/server";
import { BotChallenge } from "@/components/auth/bot-challenge";
import { SignupForm } from "@/app/signup/signup-form";

/**
 * The bot-challenge widget and its D3 gate (Public Accounts, design Screen 7).
 * Static markup only: effects (the widget script + the "ready" callback) do not
 * run under renderToStaticMarkup, so these assert the INITIAL server state —
 * which is exactly the state before any token exists, where the button must be
 * disabled.
 */
describe("BotChallenge (design Screen 7, D3)", () => {
  it("with no site key, shows the 'couldn't load' fallback (unavailable)", () => {
    const html = renderToStaticMarkup(<BotChallenge siteKey={null} />);
    expect(html).toContain("Couldn&#x27;t load the human check");
    // The hidden token field exists but is empty.
    expect(html).toContain('name="challengeToken"');
    expect(html).toContain('value=""');
  });

  it("with a site key, the initial state is the quiet 'Verifying…' loader", () => {
    const html = renderToStaticMarkup(
      <BotChallenge siteKey="1x00000000000000000000AA" />,
    );
    expect(html).toContain("Verifying…");
    expect(html).not.toContain("Couldn&#x27;t load the human check");
  });
});

describe("signup form button gating (D3)", () => {
  it("disables the primary button until the challenge is ready (null key stays disabled)", () => {
    const html = renderToStaticMarkup(
      <SignupForm view={{ mode: "public", turnstileSiteKey: null }} />,
    );
    // The create-account button is rendered disabled before any token exists.
    const buttonFragment = html.slice(html.indexOf("Create account") - 400);
    expect(buttonFragment).toContain("Create account");
    // The submit button carries the disabled attribute in its initial markup.
    expect(html).toMatch(/<button[^>]*\bdisabled\b[^>]*>[^<]*Create account/);
    // And the challenge is unavailable, telling the lifter to refresh.
    expect(html).toContain("Couldn&#x27;t load the human check");
  });
});
