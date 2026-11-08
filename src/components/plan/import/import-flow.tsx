"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2,
  TriangleAlert,
  Info,
  Check,
  CircleHelp,
  CheckCircle2,
  ChevronLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  MUSCLE_GROUPS,
  MUSCLE_GROUP_LABELS,
  EQUIPMENT_TYPES,
  EQUIPMENT_LABELS,
} from "@/lib/exercises/taxonomy";
import type {
  DraftExercise,
  DraftField,
  DraftMatch,
  FieldStatus,
  ImportDraftDto,
  ImportStatusDto,
} from "@/lib/import/draft/types";
import { deriveBlockers } from "@/lib/import/draft/build";
import {
  getImportStatusAction,
  retryExtractionAction,
  discardImportAction,
  saveDraftEditAction,
  resolveMatchAction,
  stageCustomExerciseAction,
  confirmImportAction,
} from "@/app/(app)/plan/import/actions";

/**
 * Workout Plan Import & Review (Pitch 22, OVE-106) — the Processing / Review /
 * Done flow (binding preview Screens 3/4/5). An interactive island: it polls the
 * import status, renders the source beside the editable draft, resolves matches,
 * and calls the confirm action. It NEVER touches the data layer, holds no
 * credentials, and never carries the acting user id — it calls server actions
 * only. All source/model/edit content is React-escaped (untrusted).
 *
 * "Create plan" is disabled until the SERVER-revalidated blockers are clear: the
 * same `deriveBlockers` the confirm adapter runs is used here on the current
 * draft so the button mirrors the server's authority (but the server re-derives
 * and is the real gate — a client flag never waives a blocker).
 */

type SourcePart = {
  position: number;
  text: string | null;
  url: string | null;
  contentType: string | null;
  pageCount: number | null;
};

type ApplyResult =
  | { ok: true; data: ImportDraftDto }
  | { ok: false; error: { message: string } };

type ApplyFn = (run: () => Promise<ApplyResult>) => void;

export function ImportFlow({
  sessionId,
  initialStatus,
  initialDraft,
  source,
  mesocycleId,
}: {
  sessionId: string;
  initialStatus: ImportStatusDto;
  initialDraft: ImportDraftDto | null;
  source: SourcePart[];
  mesocycleId: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = React.useState(initialStatus);

  // Poll while processing. Stops the moment the server reaches a terminal step.
  React.useEffect(() => {
    if (status.step !== "processing" || status.status !== "extracting") return;
    let active = true;
    const id = setInterval(async () => {
      const res = await getImportStatusAction({ sessionId });
      if (!active) return;
      if (res.ok) {
        setStatus(res.data);
        if (res.data.step !== "processing") {
          clearInterval(id);
          router.refresh();
        }
      }
    }, 1500);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [sessionId, status.step, status.status, router]);

  if (status.step === "done") {
    return <DoneStep draft={initialDraft} mesocycleId={mesocycleId} />;
  }
  if (status.step === "review" && initialDraft) {
    return (
      <ReviewStep sessionId={sessionId} draft={initialDraft} source={source} />
    );
  }
  return <ProcessingStep sessionId={sessionId} status={status} />;
}

/* ----------------------------- Processing ------------------------------ */

function ProcessingStep({
  sessionId,
  status,
}: {
  sessionId: string;
  status: ImportStatusDto;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function onCancel() {
    setBusy(true);
    await discardImportAction({ sessionId });
    router.push("/plan");
    router.refresh();
  }
  async function onRetry() {
    setBusy(true);
    const res = await retryExtractionAction({ sessionId });
    setBusy(false);
    if (res.ok) router.refresh();
  }

  if (status.status === "extracting") {
    return (
      <Centered>
        <Loader2
          aria-hidden
          className="mx-auto size-7 animate-spin text-muted-foreground"
        />
        <p className="text-sm text-muted-foreground">Reading your plan…</p>
        <Button variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </Centered>
    );
  }

  if (status.status === "failed_retryable") {
    return (
      <OutcomeCard
        tone="destructive"
        title="We couldn't read this one"
        body="Something went wrong reading your plan. Nothing was charged. Try again."
        actions={
          <>
            <Button disabled={busy} onClick={onRetry}>
              Try again
            </Button>
            <Button variant="ghost" disabled={busy} onClick={onCancel}>
              Cancel
            </Button>
          </>
        }
      />
    );
  }

  if (status.status === "not_a_plan") {
    return (
      <OutcomeCard
        tone="muted"
        title="That doesn't look like a workout plan"
        body="We couldn't find a plan in what you shared, so nothing was saved. You can start over with different text or files."
        actions={
          <Button variant="outline" disabled={busy} onClick={onCancel}>
            Start over
          </Button>
        }
      />
    );
  }

  if (status.errorCode === "rate_limited") {
    return (
      <OutcomeCard
        tone="muted"
        title="You've reached today's import limit"
        body="Imports are limited per day. Try again tomorrow — nothing was charged."
        actions={
          <Button variant="outline" asChild>
            <Link href="/plan">Back to Plan</Link>
          </Button>
        }
      />
    );
  }

  // failed_final / unavailable / anything else terminal.
  return (
    <OutcomeCard
      tone="muted"
      title="Plan import is unavailable right now"
      body="We couldn't process this import. Nothing was saved and nothing was charged."
      actions={
        <Button variant="outline" disabled={busy} onClick={onCancel}>
          Back to Plan
        </Button>
      }
    />
  );
}

/* ------------------------------- Review -------------------------------- */

function ReviewStep({
  sessionId,
  draft: initial,
  source,
}: {
  sessionId: string;
  draft: ImportDraftDto;
  source: SourcePart[];
}) {
  const router = useRouter();
  const [draft, setDraft] = React.useState(initial);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const blockers = React.useMemo(() => deriveBlockers(draft), [draft]);
  const blocked = blockers.length > 0;

  async function apply(
    run: () => Promise<
      | { ok: true; data: ImportDraftDto }
      | { ok: false; error: { message: string } }
    >,
  ) {
    setBusy(true);
    setError(null);
    const res = await run();
    setBusy(false);
    if (res.ok) setDraft(res.data);
    else setError(res.error.message);
  }

  async function onConfirm() {
    setBusy(true);
    setError(null);
    const res = await confirmImportAction({
      sessionId,
      version: draft.version,
    });
    setBusy(false);
    if (res.ok) {
      router.push(`/plan/import?session=${sessionId}`);
      router.refresh();
    } else {
      setError(res.error.message);
    }
  }
  async function onDiscard() {
    setBusy(true);
    await discardImportAction({ sessionId });
    router.push("/plan");
    router.refresh();
  }

  const sourcePane = <SourcePane source={source} />;

  return (
    <div className="relative flex min-h-full flex-col">
      <header className="flex h-14 items-center justify-between gap-2 border-b border-border px-1">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={onDiscard}
          >
            <ChevronLeft aria-hidden className="size-4" /> Discard
          </Button>
          <span className="text-sm font-medium">Review your plan</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="md:hidden"
          onClick={() => setSheetOpen(true)}
        >
          View source
        </Button>
      </header>

      {error && (
        <div
          role="alert"
          className="m-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      <div className="grid flex-1 gap-4 p-2 md:grid-cols-2">
        <div className="hidden md:block">{sourcePane}</div>
        <section className="space-y-4">
          <OneTimeNote />
          <TextSaveField
            key={`title-${draft.version}-${draft.title.value ?? ""}`}
            label="Plan name"
            defaultValue={draft.title.value ?? ""}
            status={draft.title.status}
            disabled={busy}
            placeholder="Plan name"
            onSave={(value) =>
              apply(() =>
                saveDraftEditAction({
                  sessionId,
                  version: draft.version,
                  patch: { kind: "title", value },
                }),
              )
            }
          />
          {draft.days.map((day) => (
            <DayCard
              key={day.key}
              sessionId={sessionId}
              version={draft.version}
              dayKey={day.key}
              label={day.label}
              exercises={day.exercises}
              disabled={busy}
              onApply={apply}
            />
          ))}

          {blocked && (
            <div className="rounded-md border border-border bg-card p-3">
              <p className="text-sm font-medium">
                Before you can create the plan:
              </p>
              <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                {blockerMessages(blockers).map((b, i) => (
                  <li key={i} className="flex gap-2">
                    <span aria-hidden className="text-destructive">
                      •
                    </span>
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center justify-between">
            {blocked ? (
              <span className="flex items-center gap-2 text-sm text-destructive">
                <TriangleAlert aria-hidden className="size-4" />
                {blockers.length} item{blockers.length === 1 ? "" : "s"} need
                attention
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">
                Looks ready.
              </span>
            )}
            <Button disabled={busy || blocked} onClick={onConfirm}>
              Create plan
            </Button>
          </div>
        </section>
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="max-h-[85%]">
          <SheetHeader>
            <SheetTitle>Source</SheetTitle>
          </SheetHeader>
          <div className="overflow-y-auto p-2">{sourcePane}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function OneTimeNote() {
  return (
    <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
      <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      <span>
        We read your plan&rsquo;s days, exercises, sets, and reps. Loads, rest,
        and percentages are shown for reference but aren&rsquo;t part of the
        plan.
      </span>
    </div>
  );
}

function SourcePane({ source }: { source: SourcePart[] }) {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-3">
      <p className="text-xs font-medium text-muted-foreground">Your source</p>
      {source.length === 0 && (
        <p className="text-sm text-muted-foreground">No source to show.</p>
      )}
      {source.map((part) => (
        <SourcePartView key={part.position} part={part} />
      ))}
    </div>
  );
}

/**
 * Render one source part in the review pane. Text is shown verbatim; an image is
 * shown inline; a PDF is embedded through its short-lived signed URL with an
 * honest "PDF · N pages" label and an open-in-new-tab link (the browser's own
 * PDF viewer renders it). A part whose signed URL could not be minted shows a
 * plain "unavailable" line, never an error that breaks the page.
 */
function SourcePartView({ part }: { part: SourcePart }) {
  if (part.text != null) {
    return (
      <pre className="whitespace-pre-wrap break-words text-sm text-foreground">
        {part.text}
      </pre>
    );
  }
  const isPdf = part.contentType === "application/pdf";
  if (isPdf) {
    if (!part.url) {
      return (
        <p className="text-sm text-muted-foreground">
          Source part {part.position + 1} (PDF) is unavailable.
        </p>
      );
    }
    const pages =
      part.pageCount != null
        ? `${part.pageCount} page${part.pageCount === 1 ? "" : "s"}`
        : "PDF";
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            PDF · {pages}
          </span>
          <a
            href={part.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground underline underline-offset-2"
          >
            Open
          </a>
        </div>
        <object
          data={part.url}
          type="application/pdf"
          aria-label={`Source part ${part.position + 1} (PDF)`}
          className="h-96 w-full rounded border border-border"
        >
          <a
            href={part.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm underline"
          >
            Open the PDF
          </a>
        </object>
      </div>
    );
  }
  if (part.url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={part.url}
        alt={`Source part ${part.position + 1}`}
        className="max-w-full rounded border border-border"
      />
    );
  }
  return (
    <p className="text-sm text-muted-foreground">
      Source part {part.position + 1} is unavailable.
    </p>
  );
}

/**
 * Uncontrolled text input that saves on blur. It is keyed on the server value by
 * the caller, so when the stored draft changes (after a save) the field remounts
 * with the new default — no setState-in-effect needed.
 */
function TextSaveField({
  label,
  defaultValue,
  status,
  disabled,
  placeholder,
  onSave,
}: {
  label: string;
  defaultValue: string;
  status: FieldStatus;
  disabled: boolean;
  placeholder: string;
  onSave: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-muted-foreground">
          {label}
        </label>
        <FieldStatusChip status={status} />
      </div>
      <Input
        defaultValue={defaultValue}
        disabled={disabled}
        onBlur={(e) => {
          const v = e.target.value;
          if (v !== defaultValue) onSave(v);
        }}
        placeholder={placeholder}
      />
    </div>
  );
}

function DayCard({
  sessionId,
  version,
  dayKey,
  label,
  exercises,
  disabled,
  onApply,
}: {
  sessionId: string;
  version: number;
  dayKey: string;
  label: DraftField<string>;
  exercises: DraftExercise[];
  disabled: boolean;
  onApply: ApplyFn;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-3">
      <TextSaveField
        key={`day-${version}-${dayKey}-${label.value ?? ""}`}
        label="Day"
        defaultValue={label.value ?? ""}
        status={label.status}
        disabled={disabled}
        placeholder="Day name"
        onSave={(value) =>
          onApply(() =>
            saveDraftEditAction({
              sessionId,
              version,
              patch: { kind: "dayLabel", dayKey, value },
            }),
          )
        }
      />
      <div className="space-y-3">
        {exercises.map((ex) => (
          <ExerciseRow
            key={ex.key}
            sessionId={sessionId}
            version={version}
            ex={ex}
            disabled={disabled}
            onApply={onApply}
          />
        ))}
      </div>
    </div>
  );
}

function ExerciseRow({
  sessionId,
  version,
  ex,
  disabled,
  onApply,
}: {
  sessionId: string;
  version: number;
  ex: DraftExercise;
  disabled: boolean;
  onApply: ApplyFn;
}) {
  function save(patch: {
    sets?: number | null;
    repMin?: number | null;
    repMax?: number | null;
  }) {
    onApply(() =>
      saveDraftEditAction({
        sessionId,
        version,
        patch: { kind: "exercise", exerciseKey: ex.key, ...patch },
      }),
    );
  }
  return (
    <div className="space-y-2 rounded-md border border-border/60 p-2">
      <MatchControl
        sessionId={sessionId}
        version={version}
        exerciseKey={ex.key}
        match={ex.match}
        disabled={disabled}
        onApply={onApply}
      />
      <div className="flex flex-wrap items-end gap-3">
        <NumField
          label="Sets"
          field={ex.sets}
          disabled={disabled}
          onSave={(v) => save({ sets: v })}
        />
        <NumField
          label="Rep min"
          field={ex.repMin}
          disabled={disabled}
          onSave={(v) => save({ repMin: v })}
        />
        <NumField
          label="Rep max"
          field={ex.repMax}
          disabled={disabled}
          onSave={(v) => save({ repMax: v })}
        />
      </div>
      {ex.context.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {ex.context.map((c, i) => (
            <ContextChip key={i}>
              {c.label}: {c.value}
            </ContextChip>
          ))}
        </div>
      )}
    </div>
  );
}

function MatchControl({
  sessionId,
  version,
  exerciseKey,
  match,
  disabled,
  onApply,
}: {
  sessionId: string;
  version: number;
  exerciseKey: string;
  match: DraftMatch;
  disabled: boolean;
  onApply: ApplyFn;
}) {
  const [showCustom, setShowCustom] = React.useState(false);

  if (match.kind === "matched") {
    return (
      <div className="flex items-center gap-2 text-sm">
        <Check aria-hidden className="size-4 text-muted-foreground" />
        <span className="font-medium">{match.name}</span>
        <span className="text-xs text-muted-foreground">matched</span>
      </div>
    );
  }
  if (match.kind === "custom_staged") {
    return (
      <div className="flex items-center gap-2 text-sm">
        <Check aria-hidden className="size-4 text-muted-foreground" />
        <span className="font-medium">{match.name}</span>
        <span className="text-xs text-muted-foreground">
          new custom exercise
        </span>
      </div>
    );
  }

  const staged = (
    <CustomExerciseForm
      sessionId={sessionId}
      version={version}
      exerciseKey={exerciseKey}
      defaultName={match.raw}
      disabled={disabled}
      onApply={onApply}
      onCancel={() => setShowCustom(false)}
    />
  );

  if (match.kind === "ambiguous") {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">
            &ldquo;{match.raw}&rdquo;
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <CircleHelp aria-hidden className="size-3" /> choose a match
          </span>
        </div>
        <div role="radiogroup" className="space-y-1">
          {match.candidates.map((c) => (
            <label
              key={c.exerciseId}
              className="flex cursor-pointer items-center gap-2 text-sm"
            >
              <input
                type="radio"
                name={`match-${exerciseKey}`}
                disabled={disabled}
                onChange={() =>
                  onApply(() =>
                    resolveMatchAction({
                      sessionId,
                      version,
                      exerciseKey,
                      exerciseId: c.exerciseId,
                    }),
                  )
                }
              />
              {c.name}
            </label>
          ))}
        </div>
        {showCustom ? (
          staged
        ) : (
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => setShowCustom(true)}
          >
            Create custom…
          </Button>
        )}
      </div>
    );
  }

  // unknown
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">&ldquo;{match.raw}&rdquo;</span>
        <span className="flex items-center gap-1 text-xs text-destructive">
          <TriangleAlert aria-hidden className="size-3" /> not in library
        </span>
      </div>
      {staged}
    </div>
  );
}

function CustomExerciseForm({
  sessionId,
  version,
  exerciseKey,
  defaultName,
  disabled,
  onApply,
  onCancel,
}: {
  sessionId: string;
  version: number;
  exerciseKey: string;
  defaultName: string;
  disabled: boolean;
  onApply: ApplyFn;
  onCancel: () => void;
}) {
  const [name, setName] = React.useState(defaultName);
  const [muscle, setMuscle] = React.useState<string>(MUSCLE_GROUPS[0]);
  const [equipment, setEquipment] = React.useState<string>(EQUIPMENT_TYPES[0]);
  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/30 p-2">
      <Input
        value={name}
        disabled={disabled}
        onChange={(e) => setName(e.target.value)}
        placeholder="Exercise name"
      />
      <div className="flex gap-2">
        <NativeSelect
          value={muscle}
          disabled={disabled}
          onChange={(e) => setMuscle(e.target.value)}
          aria-label="Primary muscle"
        >
          {MUSCLE_GROUPS.map((m) => (
            <option key={m} value={m}>
              {MUSCLE_GROUP_LABELS[m]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          value={equipment}
          disabled={disabled}
          onChange={(e) => setEquipment(e.target.value)}
          aria-label="Equipment"
        >
          {EQUIPMENT_TYPES.map((eq) => (
            <option key={eq} value={eq}>
              {EQUIPMENT_LABELS[eq]}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={disabled}
          onClick={() =>
            onApply(() =>
              stageCustomExerciseAction({
                sessionId,
                version,
                exerciseKey,
                name,
                primaryMuscle: muscle,
                equipmentType: equipment,
              }),
            )
          }
        >
          Create custom exercise
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

function NumField({
  label,
  field,
  disabled,
  onSave,
}: {
  label: string;
  field: DraftField<number>;
  disabled: boolean;
  onSave: (value: number | null) => void;
}) {
  const current = field.value?.toString() ?? "";
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <label className="text-xs font-medium text-muted-foreground">
          {label}
        </label>
        <FieldStatusChip status={field.status} />
      </div>
      <Input
        key={`num-${current}-${field.status}`}
        inputMode="numeric"
        className="h-11 w-16 tabular-nums"
        defaultValue={current}
        disabled={disabled}
        onBlur={(e) => {
          const raw = e.target.value.replace(/[^0-9]/g, "");
          if (raw !== current) {
            onSave(raw === "" ? null : Number(raw));
          }
        }}
      />
    </div>
  );
}

/* ------------------------------- Done ---------------------------------- */

function DoneStep({
  draft,
  mesocycleId,
}: {
  draft: ImportDraftDto | null;
  mesocycleId: string | null;
}) {
  const title = draft?.title.value ?? "Your plan";
  return (
    <Centered>
      <CheckCircle2
        aria-hidden
        className="mx-auto size-8 text-muted-foreground"
      />
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Plan created</h1>
        <p className="text-sm text-muted-foreground">
          &ldquo;{title}&rdquo; is in your plans as a draft. Review the days and
          activate it when you&rsquo;re ready.
        </p>
      </div>
      <div className="flex justify-center gap-2">
        {mesocycleId && (
          <Button asChild>
            <Link href={`/plan/${mesocycleId}`}>Open plan</Link>
          </Button>
        )}
        <Button variant="ghost" asChild>
          <Link href="/plan">Done</Link>
        </Button>
      </div>
    </Centered>
  );
}

/* ------------------------------ Shared --------------------------------- */

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md py-12">
      <div className="space-y-4 rounded-lg border border-border bg-card p-6 text-center">
        {children}
      </div>
    </div>
  );
}

function OutcomeCard({
  tone,
  title,
  body,
  actions,
}: {
  tone: "destructive" | "muted";
  title: string;
  body: string;
  actions: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-md py-12">
      <div
        className={
          "space-y-4 rounded-lg border p-6 " +
          (tone === "destructive"
            ? "border-destructive/40 bg-destructive/5"
            : "border-border bg-card")
        }
      >
        {tone === "destructive" ? (
          <TriangleAlert
            aria-hidden
            className="mx-auto size-7 text-destructive"
          />
        ) : (
          <Info aria-hidden className="mx-auto size-7 text-muted-foreground" />
        )}
        <p className="text-center font-medium">{title}</p>
        <p className="text-center text-sm text-muted-foreground">{body}</p>
        <div className="flex flex-wrap justify-center gap-2">{actions}</div>
      </div>
    </div>
  );
}

function FieldStatusChip({ status }: { status: FieldStatus }) {
  if (status === "explicit") return null;
  const map: Record<
    Exclude<FieldStatus, "explicit">,
    { label: string; cls: string; dot: string }
  > = {
    derived: {
      label: "derived",
      cls: "text-muted-foreground border-border",
      dot: "bg-muted-foreground/60",
    },
    missing: {
      label: "not in source",
      cls: "text-muted-foreground border-border",
      dot: "bg-muted-foreground/40",
    },
    ambiguous: {
      label: "unclear",
      cls: "text-muted-foreground border-border",
      dot: "bg-muted-foreground/60",
    },
    needed: {
      label: "needed to continue",
      cls: "text-destructive border-destructive/40",
      dot: "bg-destructive",
    },
    user_edited: {
      label: "edited",
      cls: "text-muted-foreground border-border",
      dot: "bg-muted-foreground/60",
    },
  };
  const s = map[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] ${s.cls}`}
    >
      <span aria-hidden className={`size-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

function ContextChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground tabular-nums">
      {children}
    </span>
  );
}

/* --------------------------- Blocker copy ------------------------------ */

function blockerMessages(
  blockers: ReturnType<typeof deriveBlockers>,
): string[] {
  const out = new Set<string>();
  for (const b of blockers) {
    if (b.fieldPath.endsWith("/match"))
      out.add("Resolve every exercise match.");
    else if (b.fieldPath.endsWith("/label")) out.add("Name every day.");
    else if (b.fieldPath.endsWith("/sets"))
      out.add("Set the number of sets for each exercise.");
    else if (b.fieldPath.endsWith("/repMin") || b.fieldPath.endsWith("/repMax"))
      out.add("Set a rep range for each exercise.");
    else if (b.fieldPath.endsWith("/repRange"))
      out.add("Rep min can't be more than rep max.");
    else if (b.fieldPath === "/days") out.add("Add at least one day.");
    else out.add("Fix the highlighted fields.");
  }
  return [...out];
}
