/**
 * Prescription-Aware Intelligence — UI preview (pipeline artifact).
 *
 * The visual contract for design.md Screens 1–4: the exercise card's three
 * weight states (trusted prefill, nothing yet + reference, first time), its
 * per-workout progression line, Today's per-workout call, and the exercise
 * page's "Next time" with one line per workout plus session rows that name
 * their workout. Self-contained mock data; no data-layer imports.
 *
 * The state switcher and the light/dark toggle are preview chrome only.
 */
import { useState } from "react";
import { History, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

type CardState = {
  key: string;
  label: string;
  name: string;
  scheme: string;
  gym?: string;
  /** "Last time in …", "Nothing logged in …", or "First time …". */
  context: string;
  /** Quieter "For reference: …" line; never sets the box. */
  reference?: string;
  /** Prefilled set-1 weight (trusted only). */
  offer?: number;
  tag?: "progress" | "deload";
  action?: string;
  evidence?: string;
  locked?: boolean;
};

const CARD_STATES: CardState[] = [
  {
    key: "trusted",
    label: "Trusted prefill (Sat)",
    name: "Barbell Bench Press",
    scheme: "3 × 3–5",
    context: "Last time in Push · Nov 8 · 255 × 5, 5, 4",
    offer: 255,
  },
  {
    key: "reference",
    label: "Reference from Push (first Wed)",
    name: "Barbell Bench Press",
    scheme: "3 × 6–8",
    context: "Nothing logged in Upper at 6–8 reps yet.",
    reference: "For reference: Push · 3–5 reps · Nov 8 · 255 × 5, 5, 4",
  },
  {
    key: "first",
    label: "First time",
    name: "Barbell Bench Press",
    scheme: "3 × 3–5",
    context: "First time logging this.",
  },
  {
    key: "changed",
    label: "Rep range changed",
    name: "Barbell Bench Press",
    scheme: "3 × 8–10",
    context: "Nothing logged in Upper at 8–10 reps yet.",
    reference: "For reference: Upper · 6–8 reps · Nov 12 · 230 × 8, 8, 8",
  },
  {
    key: "machine",
    label: "Machine at a gym",
    name: "Hip Abduction Machine",
    scheme: "2 × 12–15",
    gym: "Downtown Gym",
    context: "Last time in Lower Body · Nov 11 · 100 × 15, 14",
    offer: 100,
  },
  {
    key: "progress",
    label: "Pro: Sat progress",
    name: "Barbell Bench Press",
    scheme: "3 × 3–5",
    context: "Last time in Push · Nov 15 · 255 × 5, 5, 5",
    offer: 255,
    tag: "progress",
    action: "Add 5 lb → 260 lbs",
    evidence: "Top of the range two sessions in a row",
  },
  {
    key: "independent",
    label: "Pro: Wed holds (same week)",
    name: "Barbell Bench Press",
    scheme: "3 × 6–8",
    context: "Last time in Upper · Nov 12 · 230 × 8, 8, 7",
    offer: 230,
    action: "Stay at 230 lbs",
    evidence: "8, 8, 7 last time — aim for 8 on every set",
  },
  {
    key: "insufficient",
    label: "Pro: not enough history",
    name: "Barbell Bench Press",
    scheme: "3 × 6–8",
    context: "Last time in Upper · Nov 5 · 225 × 8, 7, 7",
    offer: 225,
  },
  {
    key: "free",
    label: "Free: locked call",
    name: "Barbell Bench Press",
    scheme: "3 × 3–5",
    context: "Last time in Push · Nov 15 · 255 × 5, 5, 5",
    offer: 255,
    locked: true,
  },
];

function ProgressTag({ state }: { state: "progress" | "deload" }) {
  return (
    <Badge
      variant="outline"
      className={
        state === "progress"
          ? "border-[color:var(--color-progress)] text-[color:var(--color-progress)]"
          : "border-[color:var(--color-deload)] text-[color:var(--color-deload)]"
      }
    >
      {state === "progress" ? "Progress" : "Deload"}
    </Badge>
  );
}

function ExerciseCard({ s }: { s: CardState }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-medium">{s.name}</h2>
          <p className="mt-0.5 text-sm tabular-nums text-muted-foreground">
            {s.scheme}
          </p>
          <p className="mt-1 text-sm tabular-nums text-muted-foreground">
            {s.context}
          </p>
          {s.reference ? (
            <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
              {s.reference}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {s.tag ? <ProgressTag state={s.tag} /> : null}
          {s.gym ? (
            <span className="text-xs text-muted-foreground">{s.gym}</span>
          ) : null}
        </div>
      </div>

      {s.action ? (
        <div className="mt-3 space-y-0.5">
          <p className="text-sm font-medium tabular-nums">{s.action}</p>
          {s.evidence ? (
            <p className="text-sm tabular-nums text-muted-foreground">
              {s.evidence}
            </p>
          ) : null}
        </div>
      ) : null}
      {s.locked ? (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Lock className="size-3.5" /> Progress calls are part of Pro.{" "}
          <a className="underline underline-offset-4" href="#">
            See plans
          </a>
        </p>
      ) : null}

      <div className="mt-4 space-y-2">
        <div className="flex items-start gap-2">
          <span className="w-12 pt-3 text-sm tabular-nums text-muted-foreground">
            Set 1
          </span>
          <div className="flex-1">
            <Input
              aria-label="Set 1 weight in pounds"
              inputMode="decimal"
              defaultValue={s.offer ?? ""}
              placeholder="lbs"
              className="h-12 text-lg tabular-nums tracking-tight"
            />
            {s.offer !== undefined ? (
              <p className="mt-1 text-xs text-muted-foreground">last time</p>
            ) : null}
          </div>
          <Input
            aria-label="Set 1 reps"
            inputMode="numeric"
            placeholder="reps"
            className="h-12 w-20 text-lg tabular-nums tracking-tight"
          />
          <Button className="h-12">Log set</Button>
        </div>
        <p className="pl-14 text-sm tabular-nums text-muted-foreground">
          Set 2 —
        </p>
        <p className="pl-14 text-sm tabular-nums text-muted-foreground">
          Set 3 —
        </p>
      </div>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <Skeleton className="h-5 w-48" />
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-4 w-64" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

function TodayList() {
  const rows = [
    { name: "Barbell Bench Press", scheme: "3 × 3–5", tag: "progress" as const },
    { name: "Incline Dumbbell Press", scheme: "2 × 6–10" },
    { name: "Lateral Raise", scheme: "4 × 10–15" },
  ];
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">Good morning, William. Push is up.</p>
      <h2 className="mt-2 font-medium">Push</h2>
      <ul className="mt-3 divide-y divide-border">
        {rows.map((r) => (
          <li key={r.name} className="flex items-center justify-between py-2">
            <span>
              {r.name}
              <span className="ml-2 text-sm tabular-nums text-muted-foreground">
                {r.scheme}
              </span>
            </span>
            {r.tag ? <ProgressTag state={r.tag} /> : null}
          </li>
        ))}
      </ul>
      <Button className="mt-4 h-11 w-full">Start Push</Button>
    </div>
  );
}

function ExercisePage({ multi }: { multi: boolean }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Barbell Bench Press</h1>
        <p className="text-sm text-muted-foreground">Chest · Barbell</p>
      </div>
      <section className="space-y-2">
        <h2 className="text-base font-medium">Next time</h2>
        {multi ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-medium tabular-nums">Push · 3–5 reps</p>
              <div className="flex items-center gap-2">
                <ProgressTag state="progress" />
                <p className="text-sm tabular-nums">Add 5 lb → 260 lbs</p>
              </div>
              <p className="text-sm text-muted-foreground">
                Top of the range two sessions in a row
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium tabular-nums">Upper · 8–10 reps</p>
              <p className="text-sm text-muted-foreground">
                Not enough history yet. A call comes after 2 finished workouts.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ProgressTag state="progress" />
              <p className="text-sm tabular-nums">Add 5 lb → 260 lbs</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Top of the range two sessions in a row
            </p>
          </div>
        )}
      </section>
      <section className="space-y-2">
        <h2 className="text-base font-medium">Sessions</h2>
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {[
            ["Nov 15 · Push", "255 × 5, 5, 5", "Progress"],
            ["Nov 12 · Upper", "205 × 10, 9, 9", ""],
            ["Nov 8 · Push", "255 × 5, 5, 4", ""],
            ["Nov 5 · Upper", "230 × 8, 8, 8", ""],
          ].map(([meta, sets, call]) => (
            <li key={meta} className="flex items-center justify-between gap-3 p-3">
              <div>
                <p className="text-sm text-muted-foreground tabular-nums">{meta}</p>
                <p className="tabular-nums">{sets}</p>
              </div>
              {call ? <ProgressTag state="progress" /> : null}
            </li>
          ))}
        </ul>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <History className="size-3.5" /> Records and the trend include every
          workout.
        </p>
      </section>
    </div>
  );
}

export default function PrescriptionAwarePreview() {
  const [screen, setScreen] = useState<"card" | "today" | "exercise">("card");
  const [cardKey, setCardKey] = useState(CARD_STATES[0].key);
  const [multi, setMulti] = useState(true);
  const [dark, setDark] = useState(false);
  const [loading, setLoading] = useState(false);
  const card = CARD_STATES.find((c) => c.key === cardKey) ?? CARD_STATES[0];

  return (
    <div className={dark ? "dark" : ""}>
      {/* Preview chrome — not product UI. */}
      <div className="flex flex-wrap gap-2 border-b border-border bg-muted p-3 text-sm">
        {(["card", "today", "exercise"] as const).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={screen === s ? "default" : "secondary"}
            onClick={() => setScreen(s)}
          >
            {s === "card" ? "Exercise card" : s === "today" ? "Today" : "Exercise page"}
          </Button>
        ))}
        {screen === "card" ? (
          <select
            className="rounded border border-border bg-background px-2"
            value={cardKey}
            onChange={(e) => setCardKey(e.target.value)}
          >
            {CARD_STATES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        ) : null}
        {screen === "exercise" ? (
          <Button size="sm" variant="secondary" onClick={() => setMulti((m) => !m)}>
            {multi ? "Two workouts" : "One workout"}
          </Button>
        ) : null}
        <Button size="sm" variant="secondary" onClick={() => setLoading((l) => !l)}>
          {loading ? "Loaded" : "Loading"}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setDark((d) => !d)}>
          {dark ? "Light" : "Dark"}
        </Button>
      </div>

      <main className="min-h-screen bg-background p-4 text-foreground">
        <div className="mx-auto max-w-xl space-y-3">
          {screen === "card" ? (
            <>
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>‹ {card.scheme.includes("3–5") ? "Push" : "Upper"}</span>
                <span className="tabular-nums">1 / 6</span>
              </div>
              {loading ? <CardSkeleton /> : <ExerciseCard s={card} />}
              <div className="flex gap-2">
                <Button variant="secondary" className="h-11" disabled>
                  Previous
                </Button>
                <Button className="h-11 flex-1">Next: Incline Dumbbell Press</Button>
              </div>
            </>
          ) : screen === "today" ? (
            loading ? <CardSkeleton /> : <TodayList />
          ) : loading ? (
            <CardSkeleton />
          ) : (
            <ExercisePage multi={multi} />
          )}
        </div>
      </main>
    </div>
  );
}
