"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, EllipsisVertical, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  addSessionAction,
  duplicateSessionAction,
  moveSessionAction,
  removeSessionAction,
  renameSessionAction,
} from "@/app/(app)/plan/actions";
import type { ActionResult } from "@/lib/actions/result";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DAYS_OF_WEEK, dayName } from "@/lib/plan/calendar";
import type { DayOccupancyDto } from "@/lib/plan/queries";
import { PLAN_NAME_MAX } from "@/lib/plan/validation";
import { cn } from "@/lib/utils";

export type SessionRef = {
  id: string;
  name: string;
  dayOfWeek: number | null;
  exerciseCount: number;
};

type PickResult = ActionResult<{ id: string }>;

/** A conflict naming the occupant of a day (the server's replace prompt). */
function occupiedBy(result: PickResult): string | null {
  return !result.ok && result.error.code === "conflict"
    ? (result.error.details?.occupiedBy ?? null)
    : null;
}

const NONE = "none";

/**
 * Choose a day for a session (move) or for its copy (duplicate). Each row says
 * what is on that day now. Choosing an occupied day asks before replacing,
 * and the replaced session is kept, unscheduled. Never a silent overwrite.
 */
export function DayPickerDialog({
  open,
  onOpenChange,
  mode,
  session,
  occupancy,
  pick,
  onPicked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "move" | "duplicate";
  session: SessionRef;
  occupancy: DayOccupancyDto[];
  pick: (dayOfWeek: number | null, replace: boolean) => Promise<PickResult>;
  onPicked: (dayOfWeek: number | null, newId: string) => void;
}) {
  const [confirm, setConfirm] = useState<{
    dayOfWeek: number;
    occupant: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function close(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setConfirm(null);
      setError(null);
    }
  }

  function choose(dayOfWeek: number | null, replace: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await pick(dayOfWeek, replace);
      if (result.ok) {
        close(false);
        onPicked(dayOfWeek, result.data.id);
        return;
      }
      const occupant = occupiedBy(result);
      if (occupant && dayOfWeek !== null && !replace) {
        setConfirm({ dayOfWeek, occupant });
        return;
      }
      setError(result.error.message);
    });
  }

  function onDay(day: DayOccupancyDto) {
    const occupied =
      day.sessionId !== null &&
      !(mode === "move" && day.sessionId === session.id);
    if (occupied) {
      setConfirm({
        dayOfWeek: day.dayOfWeek,
        occupant: day.sessionName ?? "a session",
      });
      return;
    }
    choose(day.dayOfWeek, false);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        {confirm ? (
          <>
            <DialogHeader className="text-left">
              <DialogTitle>
                {dayName(confirm.dayOfWeek)} already has {confirm.occupant}.
              </DialogTitle>
              <DialogDescription>
                Replace it? {confirm.occupant} stays in this mesocycle under Not
                on the schedule. Nothing is deleted.
              </DialogDescription>
            </DialogHeader>
            {error && <InlineError message={error} />}
            <DialogFooter>
              <Button
                variant="outline"
                autoFocus
                disabled={isPending}
                onClick={() => setConfirm(null)}
              >
                Cancel
              </Button>
              <Button
                disabled={isPending}
                onClick={() => choose(confirm.dayOfWeek, true)}
              >
                {isPending ? "Replacing…" : "Replace"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader className="text-left">
              <DialogTitle>
                {mode === "move" ? "Move" : "Duplicate"} {session.name}
              </DialogTitle>
              {mode === "duplicate" && (
                <DialogDescription>
                  Creates a separate copy named “{session.name} Copy”. Editing
                  one won&apos;t change the other.
                </DialogDescription>
              )}
            </DialogHeader>
            {error && <InlineError message={error} />}
            <ul className="divide-y divide-border rounded-lg border border-border">
              {occupancy.map((day) => {
                const current =
                  mode === "move" && day.dayOfWeek === session.dayOfWeek;
                return (
                  <li key={day.dayOfWeek}>
                    <button
                      type="button"
                      disabled={current || isPending}
                      onClick={() => onDay(day)}
                      className="flex min-h-11 w-full items-center gap-3 px-3 text-left text-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
                    >
                      <span className="w-10 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                        {DAYS_OF_WEEK[day.dayOfWeek - 1].short}
                      </span>
                      <span
                        className={cn(
                          "flex-1 truncate",
                          !day.sessionName && "text-muted-foreground",
                        )}
                      >
                        {day.sessionName ?? "Rest"}
                      </span>
                      {current && <Badge variant="outline">Current</Badge>}
                    </button>
                  </li>
                );
              })}
              <li>
                <button
                  type="button"
                  disabled={
                    isPending || (mode === "move" && session.dayOfWeek === null)
                  }
                  onClick={() => choose(null, false)}
                  className="flex min-h-11 w-full items-center px-3 text-left text-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
                >
                  Not on the schedule
                </button>
              </li>
            </ul>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <Alert variant="destructive" role="alert">
      <CircleAlert aria-hidden />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

/** Remove a session: plan authoring, confirmed, never touches the library. */
function RemoveSessionDialog({
  open,
  onOpenChange,
  session,
  onRemoved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: SessionRef;
  onRemoved: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  function remove() {
    startTransition(async () => {
      const result = await removeSessionAction(session.id);
      if (!result.ok) {
        toast.error(result.error.message, { duration: Infinity });
        return;
      }
      onOpenChange(false);
      toast(`${session.name} removed`, { duration: 4000 });
      onRemoved();
    });
  }
  const n = session.exerciseCount;
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader className="text-left">
          <AlertDialogTitle>Remove {session.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            {n === 0
              ? "It has no planned exercises."
              : `Its ${n} planned ${n === 1 ? "exercise goes" : "exercises go"} with it.`}{" "}
            Your exercise library, gyms, and other mesocycles are not affected.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          {/* Authoring, not destruction: outline, never destructive red. */}
          <Button variant="outline" onClick={remove} disabled={isPending}>
            {isPending ? "Removing…" : "Remove session"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * The session menu on a week row and in the session header: Move, Duplicate,
 * Remove.
 */
export function SessionActionsMenu({
  mesocycleId,
  session,
  occupancy,
  variant,
}: {
  mesocycleId: string;
  session: SessionRef;
  occupancy: DayOccupancyDto[];
  variant: "row" | "header";
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"move" | "duplicate" | "remove" | null>(
    null,
  );

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn("shrink-0", variant === "row" && "size-11")}
            aria-label={`${session.name} actions`}
          >
            <EllipsisVertical className="size-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setDialog("move")}>
            Move to another day
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog("duplicate")}>
            Duplicate to another day
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setDialog("remove")}>
            Remove session
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DayPickerDialog
        open={dialog === "move"}
        onOpenChange={(o) => setDialog(o ? "move" : null)}
        mode="move"
        session={session}
        occupancy={occupancy}
        pick={(dayOfWeek, replace) =>
          moveSessionAction({ sessionId: session.id, dayOfWeek, replace })
        }
        onPicked={(dayOfWeek) =>
          toast.success(
            dayOfWeek === null
              ? `${session.name} is off the schedule`
              : `${session.name} moved to ${dayName(dayOfWeek)}`,
            { duration: 4000 },
          )
        }
      />
      <DayPickerDialog
        open={dialog === "duplicate"}
        onOpenChange={(o) => setDialog(o ? "duplicate" : null)}
        mode="duplicate"
        session={session}
        occupancy={occupancy}
        pick={(dayOfWeek, replace) =>
          duplicateSessionAction({ sessionId: session.id, dayOfWeek, replace })
        }
        onPicked={(dayOfWeek, newId) => {
          toast.success(
            dayOfWeek === null
              ? `${session.name} copied`
              : `${session.name} copied to ${dayName(dayOfWeek)}`,
            { duration: 4000 },
          );
          // Land on the copy: it is a separate session to edit.
          router.push(`/plan/${mesocycleId}/sessions/${newId}`);
        }}
      />
      <RemoveSessionDialog
        open={dialog === "remove"}
        onOpenChange={(o) => setDialog(o ? "remove" : null)}
        session={session}
        onRemoved={() => {
          if (variant === "header") router.push(`/plan/${mesocycleId}`);
        }}
      />
    </>
  );
}

/** "+ Add session" on a rest day: a name and a day (pre-set to that day). */
export function AddSessionButton({
  mesocycleId,
  dayOfWeek,
}: {
  mesocycleId: string;
  dayOfWeek: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [day, setDay] = useState(String(dayOfWeek));
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [occupant, setOccupant] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset(next: boolean) {
    setOpen(next);
    if (!next) {
      setName("");
      setDay(String(dayOfWeek));
      setNameError(null);
      setError(null);
      setOccupant(null);
    }
  }

  function submit(replace: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await addSessionAction({
        mesocycleId,
        name,
        dayOfWeek: day === NONE ? null : Number(day),
        replace,
      });
      if (result.ok) {
        reset(false);
        toast.success("Session added", { duration: 4000 });
        router.push(`/plan/${mesocycleId}/sessions/${result.data.id}`);
        return;
      }
      const occ = occupiedBy(result);
      if (occ) {
        setOccupant(occ);
        return;
      }
      if (result.error.details?.name) setNameError(result.error.details.name);
      else setError(result.error.message);
    });
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (name.trim().length === 0) {
      setNameError("Enter a name.");
      return;
    }
    submit(false);
  }

  const long = dayName(dayOfWeek);
  return (
    <Dialog open={open} onOpenChange={reset}>
      <Button
        variant="ghost"
        size="sm"
        className="h-11"
        aria-label={`Add a session on ${long}`}
        onClick={() => setOpen(true)}
      >
        <Plus aria-hidden />
        Add session
      </Button>
      <DialogContent>
        {occupant ? (
          <>
            <DialogHeader className="text-left">
              <DialogTitle>
                {dayName(Number(day))} already has {occupant}.
              </DialogTitle>
              <DialogDescription>
                Replace it? {occupant} stays in this mesocycle under Not on the
                schedule. Nothing is deleted.
              </DialogDescription>
            </DialogHeader>
            {error && <InlineError message={error} />}
            <DialogFooter>
              <Button
                variant="outline"
                autoFocus
                disabled={isPending}
                onClick={() => setOccupant(null)}
              >
                Cancel
              </Button>
              <Button disabled={isPending} onClick={() => submit(true)}>
                {isPending ? "Replacing…" : "Replace"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={onSubmit} noValidate className="grid gap-4">
            <DialogHeader className="text-left">
              <DialogTitle>Add session</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="as-name">Name</Label>
              <Input
                id="as-name"
                value={name}
                maxLength={PLAN_NAME_MAX}
                placeholder="e.g. Upper A"
                autoComplete="off"
                className="h-11"
                aria-invalid={Boolean(nameError)}
                aria-describedby={nameError ? "as-name-error" : undefined}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameError(null);
                }}
              />
              {nameError && (
                <p
                  id="as-name-error"
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {nameError}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="as-day">Day</Label>
              <Select value={day} onValueChange={setDay}>
                <SelectTrigger id="as-day" className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAYS_OF_WEEK.map((d) => (
                    <SelectItem key={d.day} value={String(d.day)}>
                      {d.long}
                    </SelectItem>
                  ))}
                  <SelectItem value={NONE}>Not on the schedule</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {error && <InlineError message={error} />}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => reset(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Adding…" : "Add session"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Rename a session (names need not be unique). */
export function RenameSessionButton({
  sessionId,
  name,
}: {
  sessionId: string;
  name: string;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (value.trim().length === 0) {
      setError("Enter a name.");
      return;
    }
    startTransition(async () => {
      const result = await renameSessionAction({ sessionId, name: value });
      if (!result.ok) {
        setError(result.error.details?.name ?? result.error.message);
        return;
      }
      setOpen(false);
      toast.success("Session renamed", { duration: 4000 });
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setValue(name);
          setError(null);
        }
      }}
    >
      <Button
        variant="ghost"
        size="icon"
        aria-label="Rename session"
        onClick={() => setOpen(true)}
      >
        <Pencil className="size-4" />
      </Button>
      <DialogContent>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <DialogHeader className="text-left">
            <DialogTitle>Rename session</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rn-name">Name</Label>
            <Input
              id="rn-name"
              value={value}
              maxLength={PLAN_NAME_MAX}
              autoComplete="off"
              className="h-11"
              aria-invalid={Boolean(error)}
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
            />
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
