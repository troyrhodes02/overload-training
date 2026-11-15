import { Redirect } from "expo-router";
import { SIGNED_OUT_HOME } from "../app-state/RootNavigator";

/**
 * Any URL the app has no screen for goes home instead of Expo Router's
 * built-in "Unmatched Route" page. That page is a development aid: its
 * Sitemap crashes in a release bundle or an over-the-air update, where
 * `window.location` is unset (`TypeError: Cannot read property 'origin' of
 * undefined`, seen on the iPhone in 21d Checkpoint C).
 *
 * `/` is Welcome when signed out; when signed in, the guarded `(auth)` group
 * sends it on to Today (RootNavigator's redirectTo), so one target serves both.
 */
export default function NotFound() {
  return <Redirect href={SIGNED_OUT_HOME} />;
}
