import * as Haptics from "expo-haptics";

/** Success and warning only; nothing decorative (design §8). */
export const haptic = {
  success: () =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => {},
    ),
  warning: () =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
      () => {},
    ),
};
