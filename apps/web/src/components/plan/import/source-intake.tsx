"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  X,
  FileText,
  Image as ImageIcon,
  Loader2,
  TriangleAlert,
  ChevronLeft,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  MAX_TEXT_CHARS,
  MAX_PARTS,
  MAX_TOTAL_BYTES,
  MAX_FILE_BYTES,
  MAX_FILE_LABEL,
  fileTooLargeMessage,
  UPLOAD_ACCEPT_ATTR,
} from "@/lib/import/constants";
import type { ActionResult } from "@/lib/actions/result";
import { runStartFlow } from "@/lib/import/start-flow";
import {
  startImportAction,
  addTextAction,
  commitPartAction,
  removePartAction,
  beginExtractionAction,
} from "@/app/(app)/plan/import/actions";
import {
  ImportGuide,
  UsageMeter,
  type ImportUsageView,
} from "./import-guidance";

/**
 * Workout Plan Import & Review (Pitch 22) — the Source intake step (preview
 * Screen 2), an interactive island. It collects the lifter's source — pasted
 * text OR ordered files — and calls the import server actions only; it never
 * touches the data layer, holds no credentials, and never carries the acting
 * user id. Every limit it shows (character count, file count, total size) is the
 * same the server enforces (constants.ts), but the server is the authority.
 *
 * This slice stops at the source: Start begins the import by persisting the
 * source; the Processing / Review / Done steps arrive in OVE-106/107.
 */

type Part = {
  objectPath: string;
  name: string;
  contentType: string;
  sizeBytes: number;
};

function mb(bytes: number): string {
  return `${Math.round(bytes / 100_000) / 10} MB`;
}

export function SourceIntake({
  usage = null,
}: {
  /** Today's import usage, or null when it couldn't be read (meter hidden). */
  usage?: ImportUsageView | null;
} = {}) {
  const router = useRouter();
  const [mode, setMode] = React.useState<"paste" | "upload">("paste");
  const [text, setText] = React.useState("");
  const [parts, setParts] = React.useState<Part[]>([]);
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);

  const overcap = text.length > MAX_TEXT_CHARS;
  const usedBytes = parts.reduce((n, p) => n + p.sizeBytes, 0);
  const outOfImports = usage != null && usage.used >= usage.limit;
  const canStart =
    !busy &&
    !outOfImports &&
    ((mode === "paste" && text.trim().length > 0 && !overcap) ||
      (mode === "upload" && parts.length > 0));

  /** Ensure a session exists for the current mode; returns its id. */
  async function ensureSession(
    forMode: "text" | "files",
  ): Promise<string | null> {
    if (sessionId) return sessionId;
    const res = await startImportAction({ mode: forMode });
    if (!res.ok) {
      setError(res.error.message);
      return null;
    }
    setSessionId(res.data.sessionId);
    return res.data.sessionId;
  }

  const [dragging, setDragging] = React.useState(false);
  const uploadDisabled = busy || parts.length >= MAX_PARTS;

  async function onChooseFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      const id = await ensureSession("files");
      if (!id) return;
      for (const file of Array.from(files)) {
        if (parts.length >= MAX_PARTS) {
          setError(`You can add at most ${MAX_PARTS} files.`);
          break;
        }
        // Check the size BEFORE sending (OVE-139 / audit F-A3): a file over
        // the per-request cap would be cut off by the host and fail with a
        // generic error. Name the file and the limit instead.
        if (file.size > MAX_FILE_BYTES) {
          setError(fileTooLargeMessage(file.name));
          continue;
        }
        const form = new FormData();
        form.set("sessionId", id);
        form.set("file", file);
        let res: ActionResult<{
          objectPath: string;
          contentType: string;
          position: number;
        }>;
        try {
          res = (await commitPartAction(null, form)) as typeof res;
        } catch {
          // The request itself failed (for example the host refused the body).
          setError(
            `"${file.name}" couldn't be uploaded. Files can be up to ${MAX_FILE_LABEL} each.`,
          );
          continue;
        }
        if (!res.ok) {
          setError(res.error.message);
          continue;
        }
        setParts((prev) => [
          ...prev,
          {
            objectPath: res.data.objectPath,
            name: file.name,
            contentType: res.data.contentType,
            sizeBytes: file.size,
          },
        ]);
      }
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function onRemove(part: Part) {
    if (!sessionId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await removePartAction({
        sessionId,
        objectPath: part.objectPath,
      });
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      setParts((prev) => prev.filter((p) => p.objectPath !== part.objectPath));
    } finally {
      setBusy(false);
    }
  }

  async function onStart() {
    setBusy(true);
    setError(null);
    try {
      // One session for the whole sequence (see start-flow.ts): never read the
      // stale `sessionId` state after creating a session in the same handler.
      const result = await runStartFlow(
        { mode, text, sessionId },
        {
          startImport: startImportAction,
          addText: addTextAction,
          beginExtraction: beginExtractionAction,
        },
      );
      if (result.sessionId) setSessionId(result.sessionId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      // The source is persisted. Hand the session id to the Processing step: the
      // flow is server-status-driven from here, so a revisit resumes correctly.
      router.push(`/plan/import?session=${result.sessionId}`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-full flex-col">
      <header className="flex h-14 items-center gap-2 border-b border-border px-1">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
        >
          <Link href="/plan">
            <ChevronLeft aria-hidden className="size-4" /> Import plan
          </Link>
        </Button>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 space-y-5 px-4 py-6 pb-24">
        <div>
          <h1 className="text-xl font-semibold">How is your plan saved?</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Paste the plan you keep in Notes, or upload a PDF, screenshots, or
            photos of it.
          </p>
        </div>

        <ImportGuide />

        <Tabs
          value={mode}
          onValueChange={(v) => {
            setMode(v as "paste" | "upload");
            setError(null);
          }}
        >
          <TabsList>
            <TabsTrigger value="paste">Paste text</TabsTrigger>
            <TabsTrigger value="upload">Upload files</TabsTrigger>
          </TabsList>

          <TabsContent value="paste" className="space-y-1">
            <Textarea
              aria-label="Paste your plan"
              rows={9}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste your plan…"
              aria-invalid={overcap || undefined}
              className={overcap ? "border-destructive" : undefined}
            />
            <div className="flex justify-between text-xs">
              <span className="text-destructive">
                {overcap
                  ? `That's over the ${MAX_TEXT_CHARS.toLocaleString()}-character limit. Trim it to import.`
                  : ""}
              </span>
              <span
                className={
                  overcap
                    ? "text-destructive tabular-nums"
                    : "text-muted-foreground tabular-nums"
                }
              >
                {text.length.toLocaleString()} /{" "}
                {MAX_TEXT_CHARS.toLocaleString()} characters
              </span>
            </div>
          </TabsContent>

          <TabsContent value="upload" className="space-y-4">
            <div
              role="button"
              tabIndex={0}
              aria-disabled={busy || parts.length >= MAX_PARTS}
              aria-label="Choose files to upload, or drop them here"
              data-dragging={dragging || undefined}
              className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-card p-6 text-center outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring data-[dragging]:border-primary data-[dragging]:bg-muted aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
              onClick={() => {
                if (!uploadDisabled) fileInput.current?.click();
              }}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && !uploadDisabled) {
                  e.preventDefault();
                  fileInput.current?.click();
                }
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                if (!uploadDisabled) setDragging(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null))
                  setDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                if (!uploadDisabled) void onChooseFiles(e.dataTransfer.files);
              }}
            >
              <Upload aria-hidden className="size-6 text-muted-foreground" />
              <p className="text-sm">
                Drop files here or{" "}
                <span className="font-medium text-primary underline-offset-4">
                  click to choose
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                PDF, JPG, PNG, WebP, HEIC · up to {MAX_FILE_LABEL} each
              </p>
              <input
                ref={fileInput}
                type="file"
                multiple
                accept={UPLOAD_ACCEPT_ATTR}
                className="sr-only"
                tabIndex={-1}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => onChooseFiles(e.target.files)}
              />
            </div>

            {parts.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  Your source{" "}
                  <span className="text-muted-foreground">(in order)</span>
                </p>
                {parts.map((part, i) => {
                  const Icon =
                    part.contentType === "application/pdf"
                      ? FileText
                      : ImageIcon;
                  return (
                    <div
                      key={part.objectPath}
                      className="flex items-center gap-3 rounded-md border border-border bg-card p-2"
                    >
                      <span className="text-sm text-muted-foreground tabular-nums">
                        {i + 1}
                      </span>
                      <div className="grid size-10 shrink-0 place-items-center rounded bg-muted text-muted-foreground">
                        <Icon aria-hidden className="size-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {part.name}
                        </p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {mb(part.sizeBytes)}
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label={`Remove ${part.name}`}
                        disabled={busy}
                        onClick={() => onRemove(part)}
                        className="rounded p-1 text-muted-foreground hover:text-destructive disabled:opacity-50"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <p className="text-xs text-muted-foreground tabular-nums">
              {parts.length} of {MAX_PARTS} files · {mb(usedBytes)} /{" "}
              {mb(MAX_TOTAL_BYTES)}
            </p>
          </TabsContent>
        </Tabs>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm"
          >
            <TriangleAlert
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-destructive"
            />
            <p className="flex-1 text-destructive">{error}</p>
          </div>
        )}
      </main>

      <div className="sticky bottom-0 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl flex-col gap-3 md:flex-row md:items-center md:gap-6">
          {usage && <UsageMeter usage={usage} className="md:flex-1" />}
          <Button
            size="lg"
            className="w-full md:ml-auto md:w-auto"
            disabled={!canStart}
            onClick={onStart}
          >
            {busy ? (
              <>
                <Loader2 aria-hidden className="size-4 animate-spin" /> Working…
              </>
            ) : (
              "Start import"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
