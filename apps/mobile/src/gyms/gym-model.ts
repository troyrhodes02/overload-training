/**
 * The gym screens' words (Pitch 21h design G1–G3). Pure.
 */
export const GYMS_FOOTNOTE =
  "Machines and cables keep their own working weights at each gym.";

export const GYM_DETAIL_NOTE =
  "Machines and cables keep their own working weights here. A new gym starts fresh: the first workout at it sets them.";

export const GYM_LOCATION_HINT =
  "Optional. An address or a note — never a map.";

export function gymArchiveConfirmation(name: string): {
  title: string;
  message: string;
} {
  return {
    title: `Archive ${name}?`,
    message:
      "It leaves the gym pickers. Past workouts keep it, and its machine weights stay with it.",
  };
}

export const gymHref = (gymId: string) =>
  `/more/gyms/${encodeURIComponent(gymId)}`;
