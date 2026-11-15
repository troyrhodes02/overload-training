/**
 * `GET /api/mobile/v1/app-config` (public; implemented in 21c). Lets the server
 * force an update and switch features off without a new app build.
 */
export type AppConfigDto = {
  /** Below this version the API answers 426 `upgrade_required`. */
  minimumAppVersion: string;
  latestAppVersion: string;
  killSwitches: {
    planImportEnabled: boolean;
    /** The API is in maintenance; the app shows a blocking screen. */
    maintenance: boolean;
  };
  /**
   * Whether new accounts can sign up. The legacy invite mode and its code are
   * never sent (CLAUDE.md access model; spec RD-19).
   */
  signupMode: "public" | "closed";
  /**
   * The bot challenge native signup and the reset request must pass (Pitch
   * 21d RD-6). `null` means the server does not require one, which happens
   * only under its own development or Preview bypass, exactly when the web
   * hides its widget. When present, `siteKey` is the public Turnstile widget
   * key, and `origin` is the public web origin the widget runs on. Either is
   * null when the server requires a challenge but lacks the value, so the app
   * shows that signup is unavailable rather than skipping the check. Never a
   * secret. Added in 21d; an app built before it ignores the field.
   */
  botChallenge: BotChallengeDto | null;
};

export type BotChallengeDto = {
  provider: "turnstile";
  siteKey: string | null;
  origin: string | null;
};
