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
  /**
   * The public support address the web's /support page shows, when this
   * deployment configures one (Pitch 21j RD-20); null otherwise, and never a
   * placeholder. Added in 21j; an app built before it ignores the field.
   */
  supportEmail: string | null;
  /**
   * Whether the app may start the onboarding tour by itself for an account
   * whose `me.tour.autoStart` is true (Pitch 21k RD-15). False unless the
   * server sets MOBILE_TOUR_AUTO_START=true; 21l turns it on for the beta.
   * Added in 21k; an app built before it ignores the field, and an app that
   * reads a server without it treats it as false.
   */
  tourAutoStart: boolean;
};

export type BotChallengeDto = {
  provider: "turnstile";
  siteKey: string | null;
  origin: string | null;
};
