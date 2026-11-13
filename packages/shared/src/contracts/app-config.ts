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
};
