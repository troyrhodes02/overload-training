"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleAlert, EllipsisVertical } from "lucide-react";
import { toast } from "sonner";
import {
  activateMesocycleAction,
  archiveDraftMesocycleAction,
} from "@/app/(app)/plan/actions";
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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatPlanDate } from "@/lib/plan/calendar";

/**
 * Activate: the one gate from draft to live (spec D1–D3, D48). Disabled until
 * the readiness checklist is empty. The confirmation names the block it will
 * archive; the server re-checks everything and refuses (inline, nothing
 * changes) if the plan stopped being ready or the active block changed.
 */
export function ActivateButton({
  mesocycleId,
  name,
  startDate,
  ready,
  issueCount,
  activeOther,
}: {
  mesocycleId: string;
  name: string;
  startDate: string | null;
  ready: boolean;
  issueCount: number;
  activeOther: { id: string; name: string } | null;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!ready) {
    return (
      <div className="space-y-1">
        <Button className="h-11 w-full" disabled>
          Activate
        </Button>
        <p className="text-center text-xs text-muted-foreground tabular-nums">
          Fix {issueCount} {issueCount === 1 ? "item" : "items"} first.
        </p>
      </div>
    );
  }

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await activateMesocycleAction({
        mesocycleId,
        expectedActiveId: activeOther?.id ?? null,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setOpen(false);
      toast.success(`${name} is active`, { duration: 4000 });
    });
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <Button className="h-11 w-full" onClick={() => setOpen(true)}>
        Activate
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader className="text-left">
          <AlertDialogTitle>Activate {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            {activeOther
              ? `${activeOther.name} is active now. It will be archived. It stays readable and you can clone it later.`
              : `It becomes your current plan${startDate ? `, starting ${formatPlanDate(startDate)}` : ""}.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <Alert variant="destructive" role="alert">
            <CircleAlert aria-hidden />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <Button onClick={confirm} disabled={isPending}>
            {isPending ? "Activating…" : "Activate"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * The mesocycle header menu. Drafts: Archive draft (never a delete). Active
 * and archived blocks: Clone forward, when clone-forward is available.
 */
export function MesocycleMenu({
  mesocycleId,
  status,
  canClone,
}: {
  mesocycleId: string;
  status: "draft" | "active" | "archived";
  canClone: boolean;
}) {
  const router = useRouter();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (status !== "draft" && !canClone) return null;

  function archive() {
    startTransition(async () => {
      const result = await archiveDraftMesocycleAction(mesocycleId);
      if (!result.ok) {
        toast.error(result.error.message, { duration: Infinity });
        return;
      }
      setArchiveOpen(false);
      toast("Draft archived. It's under Previous.", { duration: 5000 });
      router.push("/plan");
    });
  }

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Mesocycle actions">
            <EllipsisVertical className="size-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {status === "draft" ? (
            <DropdownMenuItem onSelect={() => setArchiveOpen(true)}>
              Archive draft
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem asChild>
              <Link href={`/plan/clone/${mesocycleId}`}>Clone forward</Link>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader className="text-left">
            <AlertDialogTitle>Archive this draft?</AlertDialogTitle>
            <AlertDialogDescription>
              It moves to Previous. It won&apos;t become active, but you can
              still open it and clone it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <Button onClick={archive} disabled={isPending}>
              {isPending ? "Archiving…" : "Archive draft"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
