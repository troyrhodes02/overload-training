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
  /** A choice changed: a filter chip, a form chip, a favorite (Pitch 21h). */
  selection: () =>
    Promise.resolve()
      .then(() => Haptics.selectionAsync())
      .catch(() => {}),
};
