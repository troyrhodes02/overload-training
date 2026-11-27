/**
 * Where the privacy policy lives (OVE-265; Pitch 21l Gate 4). The web serves
 * the page at PRIVACY_POLICY_PATH. The iPhone app always opens the public
 * Production URL, in every build: Apple's reviewers and every tester read the
 * one published policy, and a staging deployment sits behind Vercel's
 * deployment protection.
 */
export const PRIVACY_POLICY_PATH = "/privacy";

/** The exact URL entered in App Store Connect and opened by the app. */
export const PRIVACY_POLICY_URL = "https://www.overloadtraining.app/privacy";
