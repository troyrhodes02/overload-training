"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import Link from "next/link";
import {
  startWorkoutAction,
  startWingItAction,
  changeGymAction,
} from "@/app/(app)/log/actions";
import { wingItBlockedResume } from "@overload/shared/logging/wing-it";

export type GymOption = { id: string; name: string };

type Props = {
  gyms: GymOption[];
  currentGymId?: string | null;
  confirmLabel?: string;
} & (
  | { mode: "start"; sessionId: string; scheduledFor: string }
  // Pitch 25: start (or resume) a Wing-It workout at the chosen gym.
  | { mode: "wing_it" }
  | { mode: "change"; loggedSessionId: string; onDone?: () => void }
);

/**
 * Workout-level gym selection (Resolved Decisions 4, 5). Active gyms only; used
 * to start a workout and to correct the gym before the first set is logged.
 * A client island — it calls server actions and never touches the database.
 */
export function GymPicker(props: Props) {
  const { gyms, currentGymId, confirmLabel } = props;
  const router = useRouter();
  const [selected, setSelected] = useState<string>(
    currentGymId ?? gyms[0]?.id ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  // Pitch 25: the workout to resume instead, when the server names one.
  const [resume, setResume] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  if (gyms.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          No active gyms. Add the gym you train at first.
        </p>
        <Button variant="secondary" onClick={() => router.push("/gyms")}>
          Go to Gyms
        </Button>
      </div>
    );
  }

  function submit() {
    setError(null);
    setResume(null);
    startTransition(async () => {
      if (props.mode === "wing_it") {
        const res = await startWingItAction({ gymId: selected });
        if (res.ok) router.push(`/log/${res.data.loggedSessionId}`);
        else {
          setError(res.error.message);
          const id = res.error.details?.loggedSessionId;
          const name = res.error.details?.sessionName;
          if (res.error.code === "conflict" && id && name)
            setResume({ id, name });
        }
      } else if (props.mode === "start") {
        const res = await startWorkoutAction({
          sessionId: props.sessionId,
          scheduledFor: props.scheduledFor,
          gymId: selected,
        });
        if (res.ok) router.push(`/log/${res.data.loggedSessionId}`);
        else setError(res.error.message);
      } else {
        const res = await changeGymAction({
          loggedSessionId: props.loggedSessionId,
          gymId: selected,
        });
        if (res.ok) {
          toast.success("Gym updated");
          props.onDone?.();
          router.refresh();
        } else {
          setError(res.error.message);
        }
      }
    });
  }

  return (
    <div className="space-y-4">
      <RadioGroup
        value={selected}
        onValueChange={setSelected}
        className="space-y-1"
      >
        {gyms.map((g) => (
          <Label
            key={g.id}
            htmlFor={`gym-${g.id}`}
            className="flex min-h-11 items-center gap-3 rounded-md px-2 text-sm"
          >
            <RadioGroupItem id={`gym-${g.id}`} value={g.id} />
            {g.name}
          </Label>
        ))}
      </RadioGroup>
      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            {error}
            {resume ? (
              <>
                {" "}
                <Link
                  href={`/log/${resume.id}`}
                  className="font-medium underline"
                >
                  {wingItBlockedResume(resume.name)}
                </Link>
              </>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      <Button
        className="w-full"
        size="lg"
        onClick={submit}
        disabled={pending || !selected}
      >
        {confirmLabel ??
          (props.mode === "change" ? "Save gym" : "Start logging")}
      </Button>
    </div>
  );
}
