/**
 * Pitch 21g correction OVE-228 (review #2, #5): the shared words name what is
 * about to start — today's workout, or a past day's from "log it late" — and
 * a long list shows five and points to History for the rest.
 */
import {
  UNFINISHED_SHOWN,
  startWhileUnfinished,
  unfinishedMore,
} from "@overload/shared/logging/unfinished";

const upperA = {
  sessionName: "Upper A",
  scheduledFor: "2026-11-19",
  gymName: null,
  setsLogged: 5,
};

it("starting today's workout says so", () => {
  const c = startWhileUnfinished(upperA, {
    scheduledFor: "2026-11-21",
    today: "2026-11-21",
  });
  expect(c.message).toBe(
    "Upper A from Thu, Nov 19 is still in progress. Resume it, or start today's workout and come back to it later.",
  );
  expect(c.startAnyway).toBe("Start today's anyway");
  expect(c.resume).toBe("Resume Upper A");
});

it("logging a past day late names that day, never 'today'", () => {
  const c = startWhileUnfinished(upperA, {
    scheduledFor: "2026-11-20",
    today: "2026-11-21",
  });
  expect(c.message).toContain("start Fri, Nov 20's workout");
  expect(c.message).not.toContain("today");
  expect(c.startAnyway).toBe("Start it anyway");
});

it("five are listed; the rest are pointed to History", () => {
  expect(UNFINISHED_SHOWN).toBe(5);
  expect(unfinishedMore(5)).toBeNull();
  expect(unfinishedMore(6)).toBe("1 more is in History.");
  expect(unfinishedMore(8)).toBe("3 more are in History.");
});
