"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { CircleCheck, TriangleAlert } from "lucide-react";
import {
  submitFeedbackAction,
  type SubmitFeedbackState,
} from "@/app/(app)/feedback/actions";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_MESSAGE_MAX,
} from "@/lib/feedback/validation";
import { ScreenshotPicker } from "@/components/send-feedback/screenshot-picker";
import { StickyActions } from "@/components/plan/plan-bits";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const FORM_ERRORS = {
  failed: "Couldn't send. Your message is still here. Try again.",
  limit: "You've sent a lot of feedback today. Try again tomorrow.",
} as const;

/**
 * Send feedback (Admin Center & Feedback design doc Screen 10; preview
 * "10 · Send feedback"). A category and a message, then an in-place
 * confirmation. Every failure keeps the draft. "Send something else" starts a
 * fresh form by remounting it.
 */
export function SendFeedback() {
  const [round, setRound] = useState(0);
  return (
    <SendFeedbackForm key={round} onAnother={() => setRound((r) => r + 1)} />
  );
}

function SendFeedbackForm({ onAnother }: { onAnother: () => void }) {
  const [state, formAction, isPending] = useActionState<
    SubmitFeedbackState,
    FormData
  >(submitFeedbackAction, { status: "idle" });
  const draft = state.status === "error" ? state.draft : null;
  const [category, setCategory] = useState(draft?.category ?? "");
  const [message, setMessage] = useState(draft?.message ?? "");
  const sentRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (state.status === "sent") sentRef.current?.focus();
  }, [state.status]);

  if (state.status === "sent") {
    return (
      <section className="space-y-4">
        <h1
          ref={sentRef}
          tabIndex={-1}
          className="inline-flex items-center gap-2 text-xl font-semibold outline-none"
        >
          <CircleCheck aria-hidden className="size-5" />
          Sent. Thanks for telling us.
        </h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="h-11" onClick={onAnother}>
            Send something else
          </Button>
          <Button asChild variant="ghost" className="h-11">
            <Link href="/">Back to Today</Link>
          </Button>
        </div>
      </section>
    );
  }

  const fieldErrors = state.status === "error" ? state.fieldErrors : {};
  const formError = state.status === "error" ? state.formError : null;
  const length = message.trim().length;
  const over = length > FEEDBACK_MESSAGE_MAX;

  return (
    <form action={formAction} noValidate className="space-y-6 pb-24 md:pb-0">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">Send feedback</h1>
        <p className="text-sm text-muted-foreground">
          Goes straight to the person who runs Overload. Replies aren&apos;t
          sent in the app.
        </p>
      </header>

      <fieldset
        className="space-y-2"
        aria-describedby={
          fieldErrors.category ? "fb-category-error" : undefined
        }
      >
        <legend className="text-sm font-medium">What is it?</legend>
        <RadioGroup
          name="category"
          value={category}
          onValueChange={setCategory}
          aria-invalid={fieldErrors.category ? true : undefined}
          className="grid grid-cols-2 gap-2"
        >
          {FEEDBACK_CATEGORIES.map((value) => (
            <Label
              key={value}
              htmlFor={`fb-category-${value}`}
              className={cn(
                "flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm font-normal",
                category === value
                  ? "border-primary bg-primary/5"
                  : "border-border",
              )}
            >
              <RadioGroupItem id={`fb-category-${value}`} value={value} />
              {FEEDBACK_CATEGORY_LABELS[value]}
            </Label>
          ))}
        </RadioGroup>
        {fieldErrors.category ? (
          <p id="fb-category-error" className="text-sm text-destructive">
            {fieldErrors.category}
          </p>
        ) : null}
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor="fb-message">Message</Label>
        <Textarea
          id="fb-message"
          name="message"
          rows={6}
          maxLength={FEEDBACK_MESSAGE_MAX}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          aria-invalid={fieldErrors.message ? true : undefined}
          aria-describedby="fb-message-help"
          className="min-h-36"
        />
        <div id="fb-message-help" className="flex justify-between text-xs">
          <span className="text-destructive">{fieldErrors.message ?? ""}</span>
          <span
            className={cn(
              "tabular-nums",
              over ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {length} / {FEEDBACK_MESSAGE_MAX}
          </span>
        </div>
      </div>

      <ScreenshotPicker serverError={fieldErrors.screenshots} />

      {formError ? (
        <Alert>
          <TriangleAlert aria-hidden className="size-4" />
          <AlertDescription>{FORM_ERRORS[formError]}</AlertDescription>
        </Alert>
      ) : null}

      <StickyActions>
        <div className="md:flex md:justify-end">
          <Button
            type="submit"
            className="h-11 w-full md:w-auto"
            disabled={isPending}
          >
            {isPending ? "Sending…" : "Send"}
          </Button>
        </div>
      </StickyActions>
    </form>
  );
}
