/* eslint-disable */
// @ts-nocheck
/**
 * Goals — UI Design Preview (implementation contract)
 * ===================================================
 * Pitch 6 · generated from docs/design/06-goals-design-doc.md v1.0
 *
 * THIS IS A RENDERING OF THE DESIGN, NOT PRODUCT CODE. It is a standalone,
 * offline, mock-data-only gallery used as the visual contract the spec and
 * implementation tickets are held to. It is deliberately disconnected from
 * Prisma, Supabase, server actions, and every real API — all data below is
 * hardcoded mock training data. It is excluded from the app's typecheck, lint,
 * and format (tsconfig.json / eslint.config.mjs / .prettierignore) and is never
 * imported into the application. The real UI is built with shadcn/ui against
 * the theme in src/app/globals.css; where this preview and the theme disagree,
 * the theme wins.
 *
 * Tailwind utility classes use Overload's semantic theme tokens (bg-card,
 * text-muted-foreground, border-border, bg-primary…) so the contract reads in
 * the implementation's vocabulary. Every number is tabular-nums.
 *
 * The defining commitments this preview must make legible:
 *   • The lifter authors the target; the history measures it. Numbers on the
 *     new-goal form are BLANK — even after a completion. No suggested target.
 *   • Unknown ≠ zero: "No performance recorded yet", no bar, no "0%".
 *   • One floored whole percentage, never above 100.
 *   • Goal surfaces use the ACCENT only. Progress green / deload amber never
 *     appear on a Goal surface (they belong to the Progress/Deload tags).
 *   • Machine/cable goals always show their Gym; a second active goal for the
 *     same exercise is blocked at any gym.
 *   • "Goal reached" is one calm card, acknowledged once. No confetti, badge,
 *     streak, XP, sound.
 *   • A pending workout owns the dashboard; goals only fill the day-complete /
 *     rest / no-plan states.
 *   • Archive, never delete; archived exercises/gyms stay named and marked.
 *
 * Mock data (internally consistent; e1RM = canonical Epley, reps 1 → weight):
 *   Bench 315×1 → target e1RM 315 · best 235×5 (Wed Sep 30) = 274.2 → 87%
 *       today Mon Oct 12 Push Day 1: 245×5 = 285.8 → 90%  (87% → 90%)
 *   Hack Squat 365×5 → 425.8 · best 320×7 = 394.7 → 92%
 *   Chest Press Machine · Downtown Gym 200×10 → 266.7 · no history at Downtown
 *   Overhead Press 155×8 → 196.3 · today 160×7 = 197.3 → reached Oct 12
 *   Incline Dumbbell Press 80×10 → 106.7 · existing best 85×10 = 113.3 → already reached
 *   Romanian Deadlift (exercise archived) 275×6 active, 94% · Lat Pulldown @ Campus
 *   Rec Center (gym archived) 180×10 active, 81%
 *   History: Overhead Press reached Oct 12 · Chest Press Machine @ Campus Rec
 *   Center (archived gym) 180×10 archived Sep 3 · Barbell Row (archived
 *   exercise) 225×5 reached Jul 20.
 */
import * as React from "react";

/* ─────────────────────────── icons (lucide paths) ─────────────────────────── */

function Icon({ children, className = "size-4" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}
const CircleCheck = ({ className }) => (
  <Icon className={className}>
    <circle cx="12" cy="12" r="10" />
    <path d="m16 9-5.5 5.5L8 12" />
  </Icon>
);
const ArchiveIcon = ({ className }) => (
  <Icon className={className}>
    <rect width="20" height="5" x="2" y="3" rx="1" />
    <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
    <path d="M10 12h4" />
  </Icon>
);
const ChevronRight = ({ className }) => (
  <Icon className={className}>
    <path d="m9 18 6-6-6-6" />
  </Icon>
);
const ChevronLeft = ({ className }) => (
  <Icon className={className}>
    <path d="m15 18-6-6 6-6" />
  </Icon>
);
const Plus = ({ className }) => (
  <Icon className={className}>
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </Icon>
);

/* ───────────────────────────── mock goal data ─────────────────────────────── */

const BENCH = {
  exercise: "Barbell Bench Press",
  meta: "Chest · Barbell",
  target: "315 lb × 1",
  percent: 87,
};
const HACK = {
  exercise: "Hack Squat",
  meta: "Quads · Machine",
  target: "365 lb × 5",
  percent: 92,
};
const CHEST_MACHINE = {
  exercise: "Chest Press Machine",
  gym: "Downtown Gym",
  target: "200 lb × 10",
  percent: null,
};
const ACTIVE = [BENCH, HACK, CHEST_MACHINE];

/* ───────────────────────────── preview chrome ───────────────────────────── */

function Frame({ name, route, tag, dark, wide, children }) {
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="flex items-baseline justify-between gap-3 text-xs text-neutral-500">
        <span className="font-medium text-neutral-700">{name}</span>
        <span className="flex items-center gap-2">
          <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[11px] text-neutral-600">
            {route}
          </code>
          {tag ? (
            <span className="rounded-full border border-neutral-300 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-500">
              {tag}
            </span>
          ) : null}
        </span>
      </figcaption>
      {/* .ov = product surface. data-ov flips the appearance mode. */}
      <div
        data-ov={dark ? "dark" : "light"}
        className={
          (dark ? "dark " : "") +
          "ov overflow-hidden rounded-2xl border border-border bg-background text-foreground shadow-sm " +
          (wide ? "w-[900px]" : "w-[375px]")
        }
      >
        {children}
      </div>
    </figure>
  );
}

const NAV = ["Today", "Plan", "History", "Goals", "Exercises", "Gyms"];

/** Phone shell: header, content, optional thumb-reach action bar, bottom nav. */
function Shell({ active = "Goals", action, children }) {
  return (
    <div className="flex min-h-[720px] flex-col">
      <header className="flex h-12 items-center border-b border-border px-4 text-sm font-semibold">
        Overload
      </header>
      <main className="flex-1 space-y-5 p-4">{children}</main>
      {action ? <div className="border-t border-border p-3">{action}</div> : null}
      <nav className="grid grid-cols-6 border-t border-border bg-card text-center text-[10px]">
        {NAV.map((item) => (
          <div
            key={item}
            className={
              "py-3 " +
              (item === active
                ? "font-semibold text-primary"
                : "text-muted-foreground")
            }
          >
            {item}
          </div>
        ))}
      </nav>
    </div>
  );
}

/** md+ shell: left rail, centered max-w-2xl column. */
function DesktopShell({ active = "Goals", children }) {
  return (
    <div className="flex min-h-[560px]">
      <aside className="w-56 shrink-0 border-r border-border p-3">
        <div className="mb-4 px-3 text-sm font-semibold">Overload</div>
        {NAV.map((item) => (
          <div
            key={item}
            className={
              "rounded-md px-3 py-2 text-sm " +
              (item === active
                ? "bg-primary/10 font-semibold text-primary"
                : "text-muted-foreground")
            }
          >
            {item}
          </div>
        ))}
      </aside>
      <main className="mx-auto w-full max-w-2xl space-y-5 p-8">{children}</main>
    </div>
  );
}

function PrimaryButton({ children, disabled, icon }) {
  return (
    <button
      disabled={disabled}
      className={
        "inline-flex h-11 w-full items-center justify-center gap-2 rounded-md text-sm font-medium " +
        (disabled
          ? "bg-muted text-muted-foreground"
          : "bg-primary text-primary-foreground")
      }
    >
      {icon}
      {children}
    </button>
  );
}
function OutlineButton({ children, className = "w-full" }) {
  return (
    <button
      className={
        "inline-flex h-11 items-center justify-center rounded-md border border-border bg-background text-sm font-medium " +
        className
      }
    >
      {children}
    </button>
  );
}
function GhostButton({ children }) {
  return (
    <button className="inline-flex h-11 items-center justify-center rounded-md px-4 text-sm font-medium text-foreground">
      {children}
    </button>
  );
}
function BackLink({ children }) {
  return (
    <div className="inline-flex items-center gap-1 text-sm text-muted-foreground">
      <ChevronLeft className="size-4" />
      {children}
    </div>
  );
}
function OutlineBadge({ children }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      {children}
    </span>
  );
}

/* ─────────────────────── Goals components (the contract) ─────────────────── */

/** Decorative bar. Accent fill only — never progress green. */
function GoalProgressBar({ percent }) {
  return (
    <div aria-hidden className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
    </div>
  );
}

/** One active goal row. percent === null → unmeasured (no bar, no %). */
function GoalRow({ g, compact }) {
  return (
    <li className={"flex items-center gap-4 " + (compact ? "p-3" : "min-h-16 p-4")}>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="flex items-center gap-2 truncate text-sm font-medium">
          {g.exercise}
          {g.exerciseArchived ? <OutlineBadge>Exercise archived</OutlineBadge> : null}
        </p>
        {g.gym ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            {g.gym}
            {g.gymArchived ? <OutlineBadge>Gym archived</OutlineBadge> : null}
          </p>
        ) : null}
        <p className="text-base font-medium tabular-nums">{g.target}</p>
        {g.percent == null ? (
          <p className="text-sm text-muted-foreground">No performance recorded yet</p>
        ) : (
          <GoalProgressBar percent={g.percent} />
        )}
      </div>
      {g.percent != null ? (
        <span className="text-2xl font-semibold tabular-nums tracking-tight">
          {g.percent}%
        </span>
      ) : null}
    </li>
  );
}

function GoalList({ goals, compact }) {
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-card">
      {goals.map((g) => (
        <GoalRow key={g.exercise} g={g} compact={compact} />
      ))}
    </ul>
  );
}

/** The one-time completion acknowledgement. Accent, calm, no animation. */
function GoalReachedCard({ exercise, gym, target, alreadyReached }) {
  return (
    <div role="status" className="space-y-4 rounded-lg border border-primary/30 bg-primary/5 p-5">
      <p className="flex items-center gap-2 text-sm font-medium">
        <CircleCheck className="size-5 text-primary" />
        Goal reached
      </p>
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{exercise}</p>
        {gym ? <p className="text-xs text-muted-foreground">{gym}</p> : null}
        <p className="text-2xl font-semibold tabular-nums tracking-tight">{target}</p>
        {alreadyReached ? (
          <p className="pt-1 text-sm text-muted-foreground">
            Already reached — your best session meets this target.
          </p>
        ) : null}
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <PrimaryButton>Set a new goal</PrimaryButton>
        </div>
        <GhostButton>Done</GhostButton>
      </div>
    </div>
  );
}

function HistoryLink({ count }) {
  return (
    <div className="flex items-center justify-between rounded-md px-1 py-2 text-sm text-muted-foreground">
      <span className="tabular-nums">Goal history ({count})</span>
      <ChevronRight className="size-4" />
    </div>
  );
}

/* ─────────────────────────────── screens ──────────────────────────────── */

function GoalsOverview({ withReached }) {
  return (
    <Shell action={<PrimaryButton icon={<Plus className="size-4" />}>New goal</PrimaryButton>}>
      <h1 className="text-lg font-semibold">Goals</h1>
      {withReached ? (
        <GoalReachedCard exercise="Overhead Press" target="155 lb × 8" />
      ) : null}
      <GoalList goals={ACTIVE} />
      <HistoryLink count={withReached ? 3 : 2} />
    </Shell>
  );
}

function GoalsOverviewDesktop() {
  return (
    <DesktopShell>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Goals</h1>
        <div className="w-36">
          <PrimaryButton icon={<Plus className="size-4" />}>New goal</PrimaryButton>
        </div>
      </div>
      <GoalList goals={ACTIVE} />
      <HistoryLink count={2} />
    </DesktopShell>
  );
}

function GoalsEmpty() {
  return (
    <Shell action={<PrimaryButton icon={<Plus className="size-4" />}>New goal</PrimaryButton>}>
      <h1 className="text-lg font-semibold">Goals</h1>
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="font-medium">No goals yet.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Set a weight × reps target for a lift to track it here.
        </p>
      </div>
    </Shell>
  );
}

function GoalsArchivedContext() {
  return (
    <Shell action={<PrimaryButton icon={<Plus className="size-4" />}>New goal</PrimaryButton>}>
      <h1 className="text-lg font-semibold">Goals</h1>
      <GoalList
        goals={[
          BENCH,
          {
            exercise: "Romanian Deadlift",
            exerciseArchived: true,
            target: "275 lb × 6",
            percent: 94,
          },
          {
            exercise: "Lat Pulldown",
            gym: "Campus Rec Center",
            gymArchived: true,
            target: "180 lb × 10",
            percent: 81,
          },
        ]}
      />
      <HistoryLink count={2} />
    </Shell>
  );
}

function PickerRow({ name, meta, mono, activeGoal }) {
  return (
    <li className="flex min-h-16 items-center gap-3 px-3 py-2">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground">
        {mono ?? ""}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="text-xs text-muted-foreground">{meta}</p>
      </div>
      {activeGoal ? (
        <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
          Active goal
        </span>
      ) : (
        <ChevronRight className="size-4 text-muted-foreground" />
      )}
    </li>
  );
}

function PickExercise() {
  return (
    <Shell>
      <div className="space-y-1">
        <BackLink>Goals</BackLink>
        <h1 className="text-lg font-semibold">New goal</h1>
        <p className="text-sm text-muted-foreground">Pick the lift.</p>
      </div>
      <div className="h-11 rounded-md border border-border bg-background px-3 text-sm leading-[44px] text-muted-foreground">
        Search exercises…
      </div>
      <div className="flex items-center gap-2 text-sm">
        <span className="rounded-md bg-muted px-3 py-1.5 font-medium">All</span>
        <span className="px-3 py-1.5 text-muted-foreground">Favorites</span>
        <span className="ml-auto rounded-md border border-border px-3 py-1.5 text-muted-foreground">
          Chest ▾
        </span>
      </div>
      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        <PickerRow name="Barbell Bench Press" meta="Chest · Barbell" activeGoal />
        <PickerRow name="Cable Fly" meta="Chest · Cable" />
        <PickerRow name="Chest Press Machine" meta="Chest · Machine" />
        <PickerRow name="Incline Dumbbell Press" meta="Chest · Dumbbell" />
        <PickerRow name="Incline Press (Smith)" meta="Chest · Machine · Custom" mono="IP" />
      </ul>
    </Shell>
  );
}

function Field({ label, children, error, help }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{label}</p>
      {children}
      {help ? <p className="text-xs text-muted-foreground">{help}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

function NumberInput({ value, suffix, invalid }) {
  return (
    <div
      className={
        "flex h-11 flex-1 items-center justify-between rounded-md border bg-background px-3 text-base tabular-nums " +
        (invalid ? "border-destructive" : "border-border")
      }
    >
      <span className={value ? "" : "text-muted-foreground"}>{value || " "}</span>
      <span className="text-sm text-muted-foreground">{suffix}</span>
    </div>
  );
}

function TargetFields({ weight, reps, weightError, repsError }) {
  return (
    <Field label="Target">
      <div className="flex items-center gap-2">
        <NumberInput value={weight} suffix="lb" invalid={!!weightError} />
        <span className="text-muted-foreground">×</span>
        <NumberInput value={reps} suffix="reps" invalid={!!repsError} />
      </div>
      {weightError ? <p className="text-sm text-destructive">{weightError}</p> : null}
      {repsError ? <p className="text-sm text-destructive">{repsError}</p> : null}
    </Field>
  );
}

function ExerciseHeading({ name, meta, mono }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-11 items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground">
        {mono ?? ""}
      </div>
      <div>
        <p className="text-sm font-medium">{name}</p>
        <p className="text-xs text-muted-foreground">{meta}</p>
      </div>
    </div>
  );
}

function TargetFormFree({ weight = "", reps = "", weightError, repsError }) {
  return (
    <Shell action={<PrimaryButton>Set goal</PrimaryButton>}>
      <div className="space-y-1">
        <BackLink>Pick another lift</BackLink>
        <h1 className="text-lg font-semibold">New goal</h1>
      </div>
      <ExerciseHeading name="Hack Squat" meta="Quads · Machine" />
      <TargetFields weight={weight} reps={reps} weightError={weightError} repsError={repsError} />
      <p className="text-xs text-muted-foreground">Counts your best session at any gym.</p>
    </Shell>
  );
}

function TargetFormMachine({ gym = "Downtown Gym", gymError }) {
  return (
    <Shell action={<PrimaryButton>Set goal</PrimaryButton>}>
      <div className="space-y-1">
        <BackLink>Pick another lift</BackLink>
        <h1 className="text-lg font-semibold">New goal</h1>
      </div>
      <ExerciseHeading name="Chest Press Machine" meta="Chest · Machine" />
      <Field
        label="Gym"
        help="Machine weights differ by gym, so this goal counts sessions at this gym only."
        error={gymError}
      >
        <div
          className={
            "flex h-11 items-center justify-between rounded-md border bg-background px-3 text-sm " +
            (gymError ? "border-destructive" : "border-border")
          }
        >
          <span className={gym ? "" : "text-muted-foreground"}>{gym || "Choose a gym"}</span>
          <span className="text-muted-foreground">▾</span>
        </div>
      </Field>
      <TargetFields weight="" reps="" />
    </Shell>
  );
}

function Alert({ children, action }) {
  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4 text-sm">
      <p>{children}</p>
      {action}
    </div>
  );
}

function TargetFormDuplicate() {
  return (
    <Shell>
      <div className="space-y-1">
        <BackLink>Pick another lift</BackLink>
        <h1 className="text-lg font-semibold">New goal</h1>
      </div>
      <ExerciseHeading name="Barbell Bench Press" meta="Chest · Barbell" />
      <Alert action={<OutlineButton className="px-4">View goal</OutlineButton>}>
        Barbell Bench Press already has an active goal:{" "}
        <span className="font-medium tabular-nums">315 lb × 1</span>{" "}
        <span className="tabular-nums">(87%)</span>. Archive it to set a different one.
      </Alert>
    </Shell>
  );
}

function TargetFormDuplicateMachine() {
  return (
    <Shell>
      <div className="space-y-1">
        <BackLink>Pick another lift</BackLink>
        <h1 className="text-lg font-semibold">New goal</h1>
      </div>
      <ExerciseHeading name="Chest Press Machine" meta="Chest · Machine" />
      <Alert action={<OutlineButton className="px-4">View goal</OutlineButton>}>
        Chest Press Machine already has an active goal at Downtown Gym:{" "}
        <span className="font-medium tabular-nums">200 lb × 10</span>. Archive it to set
        one at another gym.
      </Alert>
    </Shell>
  );
}

function TargetFormNoGym() {
  return (
    <Shell>
      <div className="space-y-1">
        <BackLink>Pick another lift</BackLink>
        <h1 className="text-lg font-semibold">New goal</h1>
      </div>
      <ExerciseHeading name="Chest Press Machine" meta="Chest · Machine" />
      <Alert action={<OutlineButton className="px-4">Add gym</OutlineButton>}>
        Add a gym first — machine goals are measured at one gym.
      </Alert>
    </Shell>
  );
}

function TargetFormArchivedExercise() {
  return (
    <Shell>
      <BackLink>Goals</BackLink>
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="font-medium">Barbell Row is archived.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Goals can only be set for active exercises.
        </p>
        <div className="mt-4">
          <OutlineButton className="px-4">Pick another lift</OutlineButton>
        </div>
      </div>
    </Shell>
  );
}

function Dl({ rows }) {
  return (
    <dl className="grid grid-cols-[5rem_1fr] gap-x-3 gap-y-2 text-sm tabular-nums">
      {rows.map(([k, v, sub]) => (
        <React.Fragment key={k}>
          <dt className="text-muted-foreground">{k}</dt>
          <dd>
            {v}
            {sub ? <span className="block text-xs text-muted-foreground">{sub}</span> : null}
          </dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

function DetailMeasured() {
  return (
    <Shell action={<OutlineButton>Archive goal</OutlineButton>}>
      <BackLink>Goals</BackLink>
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Barbell Bench Press</h1>
        <p className="text-sm text-muted-foreground">Goal · set Sep 2, 2026</p>
      </div>
      <div className="space-y-3">
        <div className="flex items-end justify-between">
          <p className="text-2xl font-semibold tabular-nums tracking-tight">315 lb × 1</p>
          <p className="text-4xl font-semibold tabular-nums tracking-tight">87%</p>
        </div>
        <GoalProgressBar percent={87} />
      </div>
      <Dl
        rows={[
          ["Best", "274 lb e1RM", "from 235 × 5 · Sep 30"],
          ["Target", "315 lb e1RM"],
        ]}
      />
      <div className="space-y-2 border-t border-border pt-3 text-xs text-muted-foreground">
        <p>Best session across all gyms. Epley estimate, same as the trend.</p>
        <p className="text-sm text-primary">e1RM trend ›</p>
      </div>
    </Shell>
  );
}

function DetailMeasuredDesktop() {
  return (
    <DesktopShell>
      <BackLink>Goals</BackLink>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">Barbell Bench Press</h1>
          <p className="text-sm text-muted-foreground">Goal · set Sep 2, 2026</p>
        </div>
        <OutlineButton className="px-4">Archive goal</OutlineButton>
      </div>
      <div className="space-y-3">
        <div className="flex items-end justify-between">
          <p className="text-2xl font-semibold tabular-nums tracking-tight">315 lb × 1</p>
          <p className="text-4xl font-semibold tabular-nums tracking-tight">87%</p>
        </div>
        <GoalProgressBar percent={87} />
      </div>
      <Dl
        rows={[
          ["Best", "274 lb e1RM", "from 235 × 5 · Sep 30"],
          ["Target", "315 lb e1RM"],
        ]}
      />
    </DesktopShell>
  );
}

function DetailNoHistoryMachine() {
  return (
    <Shell action={<OutlineButton>Archive goal</OutlineButton>}>
      <BackLink>Goals</BackLink>
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Chest Press Machine</h1>
        <p className="text-sm text-muted-foreground">Downtown Gym · set Oct 1, 2026</p>
      </div>
      <div className="space-y-1">
        <p className="text-2xl font-semibold tabular-nums tracking-tight">200 lb × 10</p>
        <p className="text-sm text-muted-foreground">
          No performance recorded yet at Downtown Gym.
        </p>
      </div>
      <Dl rows={[["Target", "267 lb e1RM"]]} />
      <p className="border-t border-border pt-3 text-xs text-muted-foreground">
        Only sessions at Downtown Gym count toward this goal.
      </p>
    </Shell>
  );
}

function DetailExerciseArchived() {
  return (
    <Shell action={<OutlineButton>Archive goal</OutlineButton>}>
      <BackLink>Goals</BackLink>
      <div className="space-y-1">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          Romanian Deadlift <OutlineBadge>Exercise archived</OutlineBadge>
        </h1>
        <p className="text-sm text-muted-foreground">Goal · set Jul 6, 2026</p>
      </div>
      <div className="space-y-3">
        <div className="flex items-end justify-between">
          <p className="text-2xl font-semibold tabular-nums tracking-tight">275 lb × 6</p>
          <p className="text-4xl font-semibold tabular-nums tracking-tight">94%</p>
        </div>
        <GoalProgressBar percent={94} />
      </div>
      <Alert>
        This exercise is archived, so new sessions won't add to this goal. Archive the goal
        when you're done with it.
      </Alert>
    </Shell>
  );
}

function DetailGymArchived() {
  return (
    <Shell action={<OutlineButton>Archive goal</OutlineButton>}>
      <BackLink>Goals</BackLink>
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Lat Pulldown</h1>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          Campus Rec Center <OutlineBadge>Gym archived</OutlineBadge>
        </p>
      </div>
      <div className="space-y-3">
        <div className="flex items-end justify-between">
          <p className="text-2xl font-semibold tabular-nums tracking-tight">180 lb × 10</p>
          <p className="text-4xl font-semibold tabular-nums tracking-tight">81%</p>
        </div>
        <GoalProgressBar percent={81} />
      </div>
      <Alert>
        Campus Rec Center is archived. This goal stays measured there; archive it when
        you're done with it.
      </Alert>
    </Shell>
  );
}

function DetailReachedAck() {
  return (
    <Shell>
      <BackLink>Goals</BackLink>
      <GoalReachedCard
        exercise="Incline Dumbbell Press"
        target="80 lb × 10"
        alreadyReached
      />
      <p className="text-sm text-muted-foreground">Set Oct 12, 2026 · Reached Oct 12, 2026</p>
    </Shell>
  );
}

function DetailHistorical({ manual }) {
  return (
    <Shell action={manual ? null : <PrimaryButton>Set a new goal</PrimaryButton>}>
      <BackLink>Goal history</BackLink>
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">
          {manual ? "Chest Press Machine" : "Overhead Press"}
        </h1>
        {manual ? (
          <p className="text-sm text-muted-foreground">Campus Rec Center (archived)</p>
        ) : null}
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          {manual ? (
            <>
              <ArchiveIcon className="size-4" /> Archived Sep 3, 2026
            </>
          ) : (
            <>
              <CircleCheck className="size-4" /> Reached Oct 12, 2026
            </>
          )}
        </p>
      </div>
      <p className="text-2xl font-semibold tabular-nums tracking-tight">
        {manual ? "180 lb × 10" : "155 lb × 8"}
      </p>
      <p className="text-sm text-muted-foreground">
        Set {manual ? "Jul 20, 2026" : "Aug 4, 2026"}
      </p>
      <p className="border-t border-border pt-3 text-sm text-primary">e1RM trend ›</p>
    </Shell>
  );
}

function HistoryRow({ exercise, gym, target, outcome, date }) {
  return (
    <li className="min-h-16 space-y-1 p-4">
      <p className="text-sm font-medium">{exercise}</p>
      {gym ? <p className="text-xs text-muted-foreground">{gym}</p> : null}
      <p className="text-base font-medium tabular-nums">{target}</p>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
        {outcome === "reached" ? (
          <CircleCheck className="size-3.5" />
        ) : (
          <ArchiveIcon className="size-3.5" />
        )}
        {outcome === "reached" ? "Reached" : "Archived"} {date}
      </p>
    </li>
  );
}

function GoalHistory() {
  return (
    <Shell>
      <div className="space-y-1">
        <BackLink>Goals</BackLink>
        <h1 className="text-lg font-semibold">Goal history</h1>
      </div>
      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        <HistoryRow exercise="Overhead Press" target="155 lb × 8" outcome="reached" date="Oct 12, 2026" />
        <HistoryRow
          exercise="Chest Press Machine"
          gym="Campus Rec Center (archived)"
          target="180 lb × 10"
          outcome="archived"
          date="Sep 3, 2026"
        />
        <HistoryRow
          exercise="Barbell Row (archived)"
          target="225 lb × 5"
          outcome="reached"
          date="Jul 20, 2026"
        />
      </ul>
    </Shell>
  );
}

function GoalHistoryEmpty() {
  return (
    <Shell>
      <div className="space-y-1">
        <BackLink>Goals</BackLink>
        <h1 className="text-lg font-semibold">Goal history</h1>
      </div>
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="font-medium">No goal history yet.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Reached and archived goals appear here.
        </p>
      </div>
    </Shell>
  );
}

/* ── dashboard ── */

function SessionGoalRows() {
  return (
    <div className="mt-4 space-y-2 border-t border-border pt-3">
      <p className="text-xs font-medium text-muted-foreground">Goals</p>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span>
          Barbell Bench Press <span className="text-muted-foreground tabular-nums">· 315 × 1</span>
        </span>
        <span className="tabular-nums">
          <span className="text-muted-foreground">87% → </span>
          <span className="font-medium">90%</span>
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span>
          Overhead Press <span className="text-muted-foreground tabular-nums">· 155 × 8</span>
        </span>
        <span className="flex items-center gap-1 text-primary">
          <CircleCheck className="size-4" /> Goal reached
        </span>
      </div>
    </div>
  );
}

function DayCompleteBlock({ goalRows = true }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <p className="font-medium">✓ Push Day 1 complete</p>
      <p className="mt-1 text-sm text-muted-foreground tabular-nums">
        Downtown Gym · 5 exercises · 15 working sets logged
      </p>
      <ul className="mt-4 space-y-2 text-sm">
        <li className="flex justify-between">
          Barbell Bench Press <span className="text-primary">trend ›</span>
        </li>
        <li className="flex justify-between">
          Overhead Press <span className="text-primary">trend ›</span>
        </li>
        <li className="flex justify-between">
          Incline Dumbbell Press <span className="text-primary">trend ›</span>
        </li>
      </ul>
      {goalRows ? <SessionGoalRows /> : null}
      <div className="mt-4 flex items-center gap-4 text-sm">
        <span className="rounded-md bg-secondary px-3 py-1.5 font-medium text-secondary-foreground">
          View workout
        </span>
        <span className="text-muted-foreground">History →</span>
      </div>
    </div>
  );
}

function CompactGoals() {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Goals</h2>
        <span className="text-sm text-muted-foreground">All goals ›</span>
      </div>
      <GoalList
        compact
        goals={[{ ...BENCH, percent: 90 }, HACK, CHEST_MACHINE]}
      />
    </section>
  );
}

function DashboardDayComplete() {
  return (
    <Shell active="Today">
      <p className="text-sm text-muted-foreground">Today · Mon, Oct 12</p>
      <DayCompleteBlock />
      <GoalReachedCard exercise="Overhead Press" target="155 lb × 8" />
      <CompactGoals />
    </Shell>
  );
}

function DashboardRest() {
  return (
    <Shell active="Today">
      <p className="text-sm text-muted-foreground">Today · Tue, Oct 13</p>
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="font-medium">No lifting planned today.</p>
        <p className="mt-1 text-sm text-muted-foreground">Rest up. History →</p>
      </div>
      <CompactGoals />
    </Shell>
  );
}

function DashboardNoGoals() {
  return (
    <Shell active="Today">
      <p className="text-sm text-muted-foreground">Today · Tue, Oct 13</p>
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="font-medium">No lifting planned today.</p>
        <p className="mt-1 text-sm text-muted-foreground">Rest up. History →</p>
      </div>
      <p className="text-sm text-muted-foreground">No active goals. Set one ›</p>
    </Shell>
  );
}

function DashboardPending() {
  return (
    <Shell active="Today" action={<PrimaryButton>Start workout</PrimaryButton>}>
      <p className="text-sm text-muted-foreground">Today · Mon, Oct 12</p>
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="font-medium">
          Push Day 1 <span className="text-muted-foreground">· Downtown Gym</span>
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">Week 3 · 5 exercises</p>
        <ul className="mt-3 space-y-1.5 text-sm tabular-nums">
          {[
            ["Barbell Bench Press", "3 × 5–8"],
            ["Overhead Press", "3 × 6–8"],
            ["Incline Dumbbell Press", "3 × 8–10"],
            ["Cable Fly", "3 × 12–15"],
            ["Triceps Pushdown", "3 × 10–12"],
          ].map(([n, s]) => (
            <li key={n} className="flex justify-between">
              {n}
              <span className="text-muted-foreground">{s}</span>
            </li>
          ))}
        </ul>
      </div>
      {/* Deliberately NO goal content while a workout is pending. */}
    </Shell>
  );
}

function DashboardUntouched() {
  return (
    <Shell active="Today">
      <p className="text-sm text-muted-foreground">Today · Wed, Oct 14</p>
      <div className="rounded-lg border border-border bg-card p-5">
        <p className="font-medium">✓ Pull Day 1 complete</p>
        <p className="mt-1 text-sm text-muted-foreground tabular-nums">
          Downtown Gym · 4 exercises · 12 working sets logged
        </p>
        <ul className="mt-4 space-y-2 text-sm">
          <li className="flex justify-between">
            Barbell Row <span className="text-primary">trend ›</span>
          </li>
          <li className="flex justify-between">
            Seated Cable Row <span className="text-primary">trend ›</span>
          </li>
        </ul>
        {/* No "Goals" section: this workout touched no goal. */}
      </div>
      <CompactGoals />
    </Shell>
  );
}

/* ── states ── */

function Sk({ className }) {
  return <div className={"animate-none rounded bg-muted " + className} />;
}

function GoalsLoading() {
  return (
    <Shell action={<PrimaryButton icon={<Plus className="size-4" />}>New goal</PrimaryButton>}>
      <Sk className="h-6 w-20" />
      <div className="divide-y divide-border rounded-lg border border-border bg-card">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-4 p-4">
            <div className="flex-1 space-y-2">
              <Sk className="h-4 w-36" />
              <Sk className="h-4 w-24" />
              <Sk className="h-1.5 w-full" />
            </div>
            <Sk className="h-7 w-12" />
          </div>
        ))}
      </div>
    </Shell>
  );
}

function GoalsError() {
  return (
    <Shell>
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="font-medium">Couldn't load your goals.</p>
        <div className="mt-4">
          <OutlineButton className="px-4">Try again</OutlineButton>
        </div>
      </div>
    </Shell>
  );
}

function ArchiveDialog() {
  return (
    <div className="relative min-h-[520px] bg-black/50 p-5">
      <div className="mt-24 space-y-4 rounded-lg border border-border bg-background p-5 shadow-lg">
        <p className="text-base font-semibold">Archive this goal?</p>
        <p className="text-sm text-muted-foreground">
          Barbell Bench Press · <span className="tabular-nums">315 lb × 1</span> moves to goal
          history. Your training history isn't touched. To chase it again, set it as a new goal.
        </p>
        <div className="flex flex-col gap-2">
          <PrimaryButton>Archive goal</PrimaryButton>
          <OutlineButton>Cancel</OutlineButton>
        </div>
      </div>
    </div>
  );
}

function Toast({ children, tone }) {
  return (
    <div className="flex min-h-[160px] items-end bg-background p-4">
      <div className="w-full rounded-lg border border-border bg-popover p-4 text-sm shadow-lg">
        <p className={tone === "error" ? "text-destructive" : ""}>{children}</p>
      </div>
    </div>
  );
}

/* ─────────────────────────────── gallery ──────────────────────────────── */

export default function Preview() {
  return (
    <div className="min-h-screen bg-neutral-50 px-6 py-8 font-sans text-neutral-900">
      <header className="mx-auto mb-8 max-w-6xl">
        <div className="text-sm font-semibold">Overload · Goals</div>
        <p className="mt-1 max-w-3xl text-sm text-neutral-600">
          The target is his; the percentage is the history's — Overload only does the
          arithmetic. One floored percentage from the best qualifying session e1RM (the same
          Epley the trend uses), never above 100, never a fake 0%. Reached is one calm card,
          acknowledged once. Goals use the accent only; progress green and deload amber never
          appear here.
        </p>
        <p className="mt-2 inline-block rounded-full bg-neutral-200 px-3 py-1 text-xs text-neutral-600">
          Rendering of the design — not product code. The app is built with shadcn/ui against
          src/app/globals.css.
        </p>
      </header>

      <Section n="01" title="Goals overview — what he's pursuing and how close, nothing else">
        <Frame name="Active goals" route="/goals" tag="measured + unmeasured">
          <GoalsOverview />
        </Frame>
        <Frame name="Active goals + unacknowledged completion" route="/goals" tag="reached card leads">
          <GoalsOverview withReached />
        </Frame>
        <Frame name="Active goals (dark)" route="/goals" tag="dark mode" dark>
          <GoalsOverview withReached />
        </Frame>
        <Frame name="Active goals · md+" route="/goals" tag="left rail · max-w-2xl" wide>
          <GoalsOverviewDesktop />
        </Frame>
        <Frame name="No goals yet" route="/goals" tag="empty">
          <GoalsEmpty />
        </Frame>
        <Frame name="Archived exercise / gym on active goals" route="/goals" tag="marked, not hidden">
          <GoalsArchivedContext />
        </Frame>
      </Section>

      <Section n="02" title="New goal — he picks the lift and types the numbers; nothing is suggested">
        <Frame name="Pick the lift" route="/goals/new" tag="active exercises only">
          <PickExercise />
        </Frame>
        <Frame name="Target · gym-consistent" route="/goals/new/[exerciseId]" tag="no gym · blank numbers">
          <TargetFormFree />
        </Frame>
        <Frame name="Target · machine/cable" route="/goals/new/[exerciseId]" tag="gym required">
          <TargetFormMachine />
        </Frame>
        <Frame name="Target · machine (dark)" route="/goals/new/[exerciseId]" tag="dark mode" dark>
          <TargetFormMachine />
        </Frame>
        <Frame name="Validation" route="/goals/new/[exerciseId]" tag="inline errors">
          <TargetFormFree
            weight="0"
            reps="2.5"
            weightError="Enter a weight above 0."
            repsError="Enter whole reps, 1 or more."
          />
        </Frame>
        <Frame name="Validation · gym missing" route="/goals/new/[exerciseId]" tag="inline error">
          <TargetFormMachine gym="" gymError="Choose the gym this goal is measured at." />
        </Frame>
        <Frame name="Duplicate active goal" route="/goals/new/[exerciseId]" tag="blocked, not replaced">
          <TargetFormDuplicate />
        </Frame>
        <Frame name="Duplicate · another gym" route="/goals/new/[exerciseId]" tag="gym ≠ second slot">
          <TargetFormDuplicateMachine />
        </Frame>
        <Frame name="No active gyms" route="/goals/new/[exerciseId]" tag="machine goal">
          <TargetFormNoGym />
        </Frame>
        <Frame name="Archived exercise (stale link)" route="/goals/new/[exerciseId]" tag="not selectable">
          <TargetFormArchivedExercise />
        </Frame>
      </Section>

      <Section n="03" title="Goal detail — target, one percentage, the best session behind it">
        <Frame name="Active · measured" route="/goals/[goalId]" tag="87% · best 235 × 5">
          <DetailMeasured />
        </Frame>
        <Frame name="Active · measured · md+" route="/goals/[goalId]" tag="desktop" wide>
          <DetailMeasuredDesktop />
        </Frame>
        <Frame name="Active · machine · no history" route="/goals/[goalId]" tag="unknown ≠ 0%">
          <DetailNoHistoryMachine />
        </Frame>
        <Frame name="Active · exercise archived" route="/goals/[goalId]" tag="manual archive offered">
          <DetailExerciseArchived />
        </Frame>
        <Frame name="Active · gym archived" route="/goals/[goalId]" tag="not re-scoped">
          <DetailGymArchived />
        </Frame>
        <Frame name="Already reached at creation" route="/goals/[goalId]" tag="completes immediately">
          <DetailReachedAck />
        </Frame>
        <Frame name="Archive confirmation" route="dialog" tag="soft · no undo">
          <ArchiveDialog />
        </Frame>
        <Frame name="Archive confirmation (dark)" route="dialog" tag="dark mode" dark>
          <ArchiveDialog />
        </Frame>
      </Section>

      <Section n="04" title="Goal history — reached and retired, secondary and complete">
        <Frame name="Goal history" route="/goals/history" tag="reached · archived">
          <GoalHistory />
        </Frame>
        <Frame name="Goal history (dark)" route="/goals/history" tag="dark mode" dark>
          <GoalHistory />
        </Frame>
        <Frame name="Historical · reached" route="/goals/[goalId]" tag="no re-derived %">
          <DetailHistorical />
        </Frame>
        <Frame name="Historical · archived manually" route="/goals/[goalId]" tag="archived gym named">
          <DetailHistorical manual />
        </Frame>
        <Frame name="No goal history" route="/goals/history" tag="empty">
          <GoalHistoryEmpty />
        </Frame>
      </Section>

      <Section n="05" title="Dashboard — the workout first; goals only when nothing is pending">
        <Frame name="Workout pending" route="/" tag="no goal content">
          <DashboardPending />
        </Frame>
        <Frame name="Day complete · goals touched" route="/" tag="87% → 90% · reached">
          <DashboardDayComplete />
        </Frame>
        <Frame name="Day complete (dark)" route="/" tag="dark mode" dark>
          <DashboardDayComplete />
        </Frame>
        <Frame name="Day complete · no goal touched" route="/" tag="no summary goal rows">
          <DashboardUntouched />
        </Frame>
        <Frame name="Rest day" route="/" tag="compact goals (≤3)">
          <DashboardRest />
        </Frame>
        <Frame name="Rest day · no active goals" route="/" tag="one quiet line">
          <DashboardNoGoals />
        </Frame>
      </Section>

      <Section n="06" title="States — loading, error, notifications">
        <Frame name="Loading" route="/goals" tag="skeleton">
          <GoalsLoading />
        </Frame>
        <Frame name="Load error" route="/goals" tag="retry">
          <GoalsError />
        </Frame>
        <Frame name="Toasts" route="toast" tag="set · archived · failures">
          <div>
            <Toast>Goal set</Toast>
            <Toast>Goal archived</Toast>
            <Toast tone="error">Couldn't set the goal. Your numbers are still here.</Toast>
          </div>
        </Frame>
      </Section>

      <Section n="07" title="Theme specimen — the tokens Goals use">
        <Frame name="Tokens" route="theme" tag="accent only">
          <div className="space-y-3 p-5 text-sm">
            <p><span className="inline-block h-3 w-8 rounded bg-primary align-middle" /> primary — bar fill, reached icon/card tint, primary actions</p>
            <p><span className="inline-block h-3 w-8 rounded bg-muted align-middle" /> muted — bar track, skeletons</p>
            <p className="text-muted-foreground">muted-foreground — gym line, dates, "No performance recorded yet"</p>
            <p className="text-2xl font-semibold tabular-nums tracking-tight">87% · text-2xl/4xl semibold</p>
            <p className="text-base font-medium tabular-nums">315 lb × 1 · target, text-base medium</p>
            <p className="text-xs text-muted-foreground">No progress green. No deload amber. No status color on any Goal surface.</p>
          </div>
        </Frame>
        <Frame name="Commitments" route="legend" tag="check every frame">
          <ul className="space-y-2 p-5 text-sm">
            <li>✓ Target authored by the lifter; numbers never pre-filled</li>
            <li>✓ Percentage derived, floored, ≤ 100; unknown ≠ 0%</li>
            <li>✓ One active goal per exercise, at any gym</li>
            <li>✓ Machine goals always show their gym</li>
            <li>✓ Reached = one calm card, acknowledged once</li>
            <li>✓ Workout owns the dashboard while pending</li>
            <li>✓ Archive only — no delete, no undo, no reopen</li>
            <li>✓ No dates, pacing, suggestions, streaks, badges, confetti</li>
          </ul>
        </Frame>
      </Section>

      <footer className="mx-auto mt-10 max-w-6xl border-t border-neutral-200 pt-4 text-xs text-neutral-500">
        Generated from docs/design/06-goals-design-doc.md v1.0. Commitments: lifter-authored
        targets · canonical e1RM · best (not latest) qualifying session · floored % capped at
        100 · unmeasured ≠ 0% · gym-scoped machine goals · one active goal per exercise ·
        one-time calm completion · archive, never delete. Rendering only — not imported into
        the app.
      </footer>
    </div>
  );
}

function Section({ n, title, children }) {
  return (
    <section className="mx-auto mb-10 max-w-6xl">
      <h2 className="mb-4 flex items-baseline gap-3 text-sm font-medium text-neutral-700">
        <span className="font-mono text-neutral-400">{n}</span>
        {title}
      </h2>
      <div className="flex flex-wrap gap-6">{children}</div>
    </section>
  );
}
