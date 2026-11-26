/**
 * A5's once-per-launch rule (Pitch 21j design §6 A5; RD-5, RD-7). The server
 * decides what is due (`me.whatsNew`, with the web's precedence and the
 * account floor); the app shows it at most once per JS launch, and never over
 * a workout.
 */
let shownThisLaunch = false;

export function shouldShowWhatsNew(input: {
  due: boolean;
  pathname: string;
  /** A tour is running (21l RD-23): the sheet waits until it ends. */
  tourActive?: boolean;
}): boolean {
  if (shownThisLaunch || !input.due || input.tourActive) return false;
  return !input.pathname.startsWith("/workout");
}

export function markWhatsNewShown(): void {
  shownThisLaunch = true;
}

/** Tests only. */
export function resetWhatsNewLaunch(): void {
  shownThisLaunch = false;
}
