import * as Haptics from "expo-haptics";

/**
 * Success and warning, plus the light tap when a set saves (Pitch 21e design
 * §8, overload-mobile-ui); nothing decorative.
 */
export const haptic = {
  light: () =>
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  success: () =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => {},
    ),
  warning: () =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
      () => {},
    ),
};
