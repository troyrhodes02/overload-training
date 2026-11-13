"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, TriangleAlert } from "lucide-react";
import {
  setFeedbackCategoryAction,
  setFeedbackHandledAction,
} from "@/app/admin/feedback/[id]/actions";
import {
  FEEDBACK_CATEGORY_LABEL,
  type FeedbackCategoryValue,
} from "@/lib/admin/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";

/**
 * The feedback item's two controls (Admin Center & Feedback design doc
 * Screen 8; spec R17): re-file under another category (Save enabled only
 * when it changed), and Mark handled / Reopen. No dialog — both are
 * reversible and audited. A failure says nothing changed and keeps the
 * previous value.
 */

export function FeedbackCategoryControl({
  feedbackId,
  category,
}: {
  feedbackId: string;
  category: FeedbackCategoryValue;
}) {
  const [value, setValue] = useState<FeedbackCategoryValue>(category);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    setFailed(false);
    startTransition(async () => {
      const result = await setFeedbackCategoryAction(feedbackId, value);
      if (!result.ok) {
        setFailed(true);
        setValue(category);
        return;
      }
      toast.success("Category saved.");
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex max-w-xs items-center gap-2">
        <NativeSelect
          aria-label="Category"
          value={value}
          onChange={(e) => setValue(e.target.value as FeedbackCategoryValue)}
          disabled={pending}
        >
          {Object.entries(FEEDBACK_CATEGORY_LABEL).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </NativeSelect>
        <Button
          variant="outline"
          disabled={pending || value === category}
          onClick={save}
        >
          Save
        </Button>
      </div>
      {failed ? (
        <Alert>
          <TriangleAlert aria-hidden className="size-4" />
          <AlertDescription>
            Couldn&apos;t save. Nothing changed.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

export function FeedbackHandledControl({
  feedbackId,
  handled,
  handledLine,
}: {
  feedbackId: string;
  handled: boolean;
  /** "Handled Oct 22 by William Rhodes", when handled. */
  handledLine: string | null;
}) {
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  function toggle() {
    setFailed(false);
    startTransition(async () => {
      const result = await setFeedbackHandledAction(feedbackId, !handled);
      if (!result.ok) {
        setFailed(true);
        return;
      }
      toast.success(handled ? "Reopened." : "Marked handled.");
    });
  }

  return (
    <section className="space-y-2 rounded-lg border border-border p-4">
      {handled ? (
        <>
          <p className="inline-flex items-center gap-1.5 text-sm">
            <Check aria-hidden className="size-4" />
            {handledLine ?? "Handled"}
          </p>
          <div>
            <Button variant="outline" disabled={pending} onClick={toggle}>
              Reopen
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm font-medium">Open</p>
          <Button className="h-11 md:h-10" disabled={pending} onClick={toggle}>
            Mark handled
          </Button>
        </>
      )}
      {failed ? (
        <Alert>
          <TriangleAlert aria-hidden className="size-4" />
          <AlertDescription>
            Couldn&apos;t save. Nothing changed.
          </AlertDescription>
        </Alert>
      ) : null}
    </section>
  );
}
