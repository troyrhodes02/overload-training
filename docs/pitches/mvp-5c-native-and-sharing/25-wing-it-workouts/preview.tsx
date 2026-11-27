/**
 * Wing-It Workouts — UI preview (pipeline artifact, Pitch 25).
 *
 * The visual contract for design.md §6: Today's Wing-It section in each
 * dashboard state (no plan, scheduled, missed, rest, open, finished, blocked),
 * the Wing-It runner (empty and with an open-ended card), the Add exercise
 * picker, and the History rows. Self-contained mock data; no data-layer
 * imports, no network. The state switcher is preview chrome only.
 */
import { useState } from "react";
import { Plus, Star } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type TodayState =
  | "no_plan"
  | "scheduled"
  | "missed"
  | "rest"
  | "open"
  | "finished"
  | "blocked";

const HELPER_PLAN =
  "Train something that isn't in your plan. Today's planned workout stays as it is.";
const HELPER_REST = "Not on today's plan? Log it as a Wing-It workout.";

function PlannedBlock({ dimmed }: { dimmed?: boolean }) {
  return (
    <div className={dimmed ? "pointer-events-none opacity-50" : ""}>
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="font-medium">Upper A</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Week 2 · 5 exercises
        </p>
        <ul className="mt-3 space-y-1.5 text-sm tabular-nums">
          <li className="flex justify-between">
            <span>Barbell Bench Press</span>
            <span className="text-muted-foreground">3 × 6–8</span>
          </li>
          <li className="flex justify-between">
            <span>Seated Cable Row</span>
            <span className="text-muted-foreground">3 × 8–12</span>
          </li>
        </ul>
      </div>
      <Button size="lg" className="mt-4 w-full">
        Start workout
      </Button>
    </div>
  );
}

function WingItSection({ state }: { state: TodayState }) {
  const primary = state === "no_plan";
  const helper = state === "rest" ? HELPER_REST : HELPER_PLAN;
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h2 className="text-sm font-medium">Wing-It workout</h2>
      {state === "open" ? (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            Harbor Barbell · 4 sets saved
          </p>
          <Button variant="secondary" className="mt-4 h-11 w-full">
            Resume Wing-It workout
          </Button>
        </>
      ) : (
        <>
          {state !== "no_plan" ? (
            <p className="mt-1 text-sm text-muted-foreground">{helper}</p>
          ) : null}
          {state === "finished" ? (
            <div className="mt-3 flex items-center justify-between text-sm">
              <span>
                ✓ Wing-It workout · Harbor Barbell · 3 exercises · 9 sets
              </span>
              <a className="text-primary">View workout</a>
            </div>
          ) : null}
          <Button
            variant={primary ? "default" : "secondary"}
            size={primary ? "lg" : "default"}
            className="mt-4 h-11 w-full"
          >
            Start Wing-It workout
          </Button>
          {state === "blocked" ? (
            <Alert className="mt-3" role="alert">
              <AlertDescription>
                Finish Upper A first. It&apos;s still in progress with sets
                saved.{" "}
                <a className="font-medium underline">Resume Upper A</a>
              </AlertDescription>
            </Alert>
          ) : null}
        </>
      )}
    </div>
  );
}

function Today({ state }: { state: TodayState }) {
  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">
          Good morning, Sam.
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Today · Fri, Nov 27</p>
      </header>
      {state === "no_plan" ? (
        <div className="rounded-lg border border-border bg-card p-6">
          <p className="font-medium">No active plan.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Build a plan for progress calls, or log a Wing-It workout now.{" "}
            <a className="underline">Plan →</a>
          </p>
        </div>
      ) : null}
      {state === "missed" ? (
        <div className="rounded-lg border border-attention bg-card p-6">
          <p className="font-medium">You missed Lower A on Wednesday.</p>
          <div className="mt-4 flex gap-2">
            <Button size="sm">Log it late</Button>
            <Button size="sm" variant="secondary">
              Shift
            </Button>
            <Button size="sm" variant="secondary">
              Skip
            </Button>
          </div>
        </div>
      ) : null}
      {state === "rest" ? (
        <div className="rounded-lg border border-border bg-card p-6">
          <p className="font-medium">No lifting planned today.</p>
          <p className="mt-1 text-sm text-muted-foreground">Rest up.</p>
        </div>
      ) : null}
      {state === "scheduled" ||
      state === "open" ||
      state === "finished" ||
      state === "blocked" ? (
        <PlannedBlock />
      ) : null}
      {state === "missed" ? <PlannedBlock dimmed /> : null}
      {/* Always outside the inert region (design §6.4). */}
      <WingItSection state={state} />
    </section>
  );
}

function Runner({ empty }: { empty: boolean }) {
  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between">
        <p className="font-medium">
          Wing-It workout
          <span className="text-muted-foreground"> · Harbor Barbell</span>
        </p>
        {empty ? (
          <button className="text-sm text-muted-foreground underline">
            Change gym
          </button>
        ) : null}
      </div>
      {empty ? (
        <div className="rounded-lg border border-border bg-card p-6 text-center">
          <p className="font-medium">No exercises yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add the first one you&apos;re doing.
          </p>
          <Button className="mt-4 h-11">
            <Plus className="size-4" aria-hidden /> Add exercise
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="font-medium">Leg Press</h2>
          <p className="mt-0.5 text-sm tabular-nums text-muted-foreground">
            2 sets logged · Harbor Barbell
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Last time: Nov 20 · 270 × 12, 270 × 10
          </p>
          <ul className="mt-4 space-y-2 text-sm tabular-nums">
            <li className="flex justify-between rounded-md bg-muted px-3 py-2">
              <span>Set 1</span>
              <span>270 lbs × 12</span>
            </li>
            <li className="flex justify-between rounded-md bg-muted px-3 py-2">
              <span>Set 2</span>
              <span>290 lbs × 10</span>
            </li>
            <li className="grid grid-cols-[auto_1fr_1fr_auto] items-center gap-2">
              <span>Set 3</span>
              <Input aria-label="Set 3 weight in pounds" placeholder="lbs" />
              <Input aria-label="Set 3 reps" placeholder="reps" />
              <Button>Save</Button>
            </li>
          </ul>
        </div>
      )}
      {!empty ? (
        <div className="flex items-center justify-between">
          <Button variant="ghost">‹ Previous</Button>
          <Button variant="ghost">Next: Cable Fly ›</Button>
        </div>
      ) : null}
      {!empty ? (
        <Button variant="secondary" className="h-11 w-full">
          <Plus className="size-4" aria-hidden /> Add exercise
        </Button>
      ) : null}
      <Button size="lg" className="w-full" disabled={empty}>
        Finish workout
      </Button>
      {empty ? (
        <p className="text-center text-xs text-muted-foreground">
          Log at least one set before finishing.
        </p>
      ) : null}
    </section>
  );
}

const CANDIDATES = [
  { name: "Leg Press", favorite: true, inWorkout: true },
  { name: "Cable Fly", favorite: true, inWorkout: false },
  { name: "Hack Squat", favorite: false, inWorkout: false },
  { name: "Lat Pulldown", favorite: false, inWorkout: false },
];

function Picker() {
  const [q, setQ] = useState("");
  const shown = CANDIDATES.filter((c) =>
    c.name.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <section className="space-y-4">
      <p className="font-medium">Add an exercise</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <select className="h-10 rounded-md border border-input bg-background px-3 text-sm">
          <option>All muscle groups</option>
          <option>Chest</option>
          <option>Quads</option>
        </select>
        <Input
          placeholder="Search exercises"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {shown.map((c) => (
          <li key={c.name}>
            <button className="flex w-full items-center justify-between px-4 py-3 text-left text-sm">
              <span className="flex items-center gap-2">
                {c.favorite ? (
                  <Star className="size-4 fill-current" aria-label="Favorite" />
                ) : null}
                {c.name}
              </span>
              {c.inWorkout ? (
                <span className="text-xs text-muted-foreground">
                  In this workout
                </span>
              ) : null}
            </button>
          </li>
        ))}
        {shown.length === 0 ? (
          <li className="px-4 py-3 text-sm text-muted-foreground">
            No exercises match.
          </li>
        ) : null}
      </ul>
    </section>
  );
}

function HistoryRows() {
  // Active block week: each Wing-It workout sits on its day, after that
  // day's planned workout (design §6.9).
  const rows = [
    ["Mon, Nov 23", "Upper A", "Complete"],
    ["Wed, Nov 25", "Lower A", "Upcoming"],
    ["", "Wing-It workout", "Complete"],
  ];
  return (
    <section className="space-y-3">
      <p className="font-medium">Week 2 of 5 · Nov 23 – Nov 29</p>
      <ul className="divide-y divide-border rounded-lg border border-border bg-card text-sm">
        {rows.map(([day, name, state], i) => (
          <li key={i} className="flex justify-between px-4 py-3">
            <span className="w-28 text-muted-foreground">{day}</span>
            <span className="flex-1">{name}</span>
            <span className="text-muted-foreground">{state}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const VIEWS = [
  "today:no_plan",
  "today:scheduled",
  "today:missed",
  "today:rest",
  "today:open",
  "today:finished",
  "today:blocked",
  "runner:empty",
  "runner:card",
  "picker",
  "history",
] as const;

export default function WingItPreview() {
  const [view, setView] = useState<(typeof VIEWS)[number]>("today:scheduled");
  const [kind, arg] = view.split(":");
  return (
    <div className="mx-auto max-w-xl space-y-6 p-6">
      <div className="flex flex-wrap gap-1">
        {VIEWS.map((v) => (
          <Button
            key={v}
            size="sm"
            variant={v === view ? "default" : "outline"}
            onClick={() => setView(v)}
          >
            {v}
          </Button>
        ))}
      </div>
      {kind === "today" ? <Today state={arg as TodayState} /> : null}
      {kind === "runner" ? <Runner empty={arg === "empty"} /> : null}
      {kind === "picker" ? <Picker /> : null}
      {kind === "history" ? <HistoryRows /> : null}
    </div>
  );
}
