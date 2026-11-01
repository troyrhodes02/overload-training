"use client";

import { useReducer } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * The "Your data" card in Settings (Public Accounts design doc Screen 8, D4;
 * spec §9, R7). One Free button that downloads everything the account owns as
 * a single JSON file. It is never gated — capture, history, and export are
 * always free (CLAUDE.md) — so there is no upgrade note here.
 *
 * The download itself is served by GET /settings/export (a route handler that
 * resolves the account from the session). This island holds NO data access and
 * no credentials: it only fetches that URL and hands the bytes to the browser.
 *
 * States (a reducer, so they are unit-testable):
 *   - idle        the button reads "Export your data".
 *   - preparing   the button reads "Preparing…" and is disabled while the
 *                 whole-account file is assembled; the layout does not shift.
 *   - error       a destructive Alert above the button; the button returns to
 *                 idle. Nothing partial is downloaded.
 * Success is a Sonner toast ("Your data is downloading."), after which the
 * state returns to idle.
 */

export type ExportState = "idle" | "preparing" | "error";

export type ExportAction =
  { type: "start" } | { type: "succeed" } | { type: "fail" };

export function exportReducer(
  state: ExportState,
  action: ExportAction,
): ExportState {
  switch (action.type) {
    case "start":
      return "preparing";
    case "succeed":
      // Back to idle; the toast carries the success signal.
      return "idle";
    case "fail":
      return "error";
    default:
      return state;
  }
}

const EXPORT_URL = "/settings/export";

/** Reads the filename the server chose from the Content-Disposition header. */
export function filenameFromDisposition(
  header: string | null,
  fallback: string,
): string {
  if (!header) return fallback;
  const match = /filename="?([^"]+)"?/i.exec(header);
  return match ? match[1] : fallback;
}

export function DataExportSection() {
  const [state, dispatch] = useReducer(exportReducer, "idle");

  async function onExport() {
    dispatch({ type: "start" });
    try {
      const response = await fetch(EXPORT_URL, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(`export failed: ${response.status}`);
      const blob = await response.blob();
      const filename = filenameFromDisposition(
        response.headers.get("Content-Disposition"),
        "overload-export.json",
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      dispatch({ type: "succeed" });
      toast.success("Your data is downloading.", { duration: 4000 });
    } catch {
      // The copy never reveals internals; the lifter simply retries.
      dispatch({ type: "fail" });
    }
  }

  const preparing = state === "preparing";

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-medium text-muted-foreground">Your data</h2>
      <div className="space-y-1">
        <p className="font-medium">Export your data</p>
        <p className="text-sm text-muted-foreground">
          Download everything in your account as one file: your plans, workouts,
          logged sets, goals, gyms, cardio, and profile. It&apos;s private to
          you.
        </p>
      </div>
      {state === "error" ? (
        <Alert variant="destructive">
          <AlertDescription>
            Couldn&apos;t prepare your export. Try again.
          </AlertDescription>
        </Alert>
      ) : null}
      <Button
        type="button"
        className="h-11"
        onClick={onExport}
        disabled={preparing}
      >
        {preparing ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Preparing…
          </>
        ) : (
          <>
            <Download className="size-4" aria-hidden="true" />
            Export your data
          </>
        )}
      </Button>
    </section>
  );
}
