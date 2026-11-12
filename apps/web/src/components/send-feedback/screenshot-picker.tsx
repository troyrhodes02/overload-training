"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  FEEDBACK_SCREENSHOT_MAX_COUNT,
  FEEDBACK_SCREENSHOT_TYPES,
  validateScreenshots,
} from "@/lib/feedback/attachment-validation";
import { cn } from "@/lib/utils";

type Item = { file: File; url: string };

/**
 * Optional feedback screenshots (Admin Center & Feedback). A hidden multi-file
 * input carries the chosen images in the form's FormData under "screenshots";
 * React state drives the thumbnails and per-image removal, and the input's
 * FileList is rebuilt from that state (via DataTransfer) so the native form
 * submission always matches what the lifter sees. Client-side validation mirrors
 * the server's, which is still the authority. Preview object URLs are created
 * when a file is added and revoked when it is removed or the picker unmounts.
 */
export function ScreenshotPicker({ serverError }: { serverError?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Revoke any still-open preview URLs when the picker unmounts (e.g. the form
  // remounts after "Send something else"). Read through a ref so the effect
  // never depends on, or sets, render state.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(
    () => () => itemsRef.current.forEach((i) => URL.revokeObjectURL(i.url)),
    [],
  );

  function sync(nextFiles: File[]) {
    const check = validateScreenshots(
      nextFiles.map((f) => ({ name: f.name, type: f.type, size: f.size })),
    );
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setError(null);
    const next = nextFiles.map(
      (file) =>
        items.find((i) => i.file === file) ?? {
          file,
          url: URL.createObjectURL(file),
        },
    );
    items.forEach((i) => {
      if (!nextFiles.includes(i.file)) URL.revokeObjectURL(i.url);
    });
    setItems(next);
    // Rebuild the input's FileList so the form submits exactly these files.
    const dt = new DataTransfer();
    nextFiles.forEach((f) => dt.items.add(f));
    if (inputRef.current) inputRef.current.files = dt.files;
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length === 0) return;
    sync([...items.map((i) => i.file), ...picked]);
  }

  function removeAt(index: number) {
    sync(items.filter((_, i) => i !== index).map((i) => i.file));
  }

  const shown = error ?? serverError ?? null;

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        name="screenshots"
        multiple
        accept={FEEDBACK_SCREENSHOT_TYPES.join(",")}
        className="sr-only"
        aria-hidden
        tabIndex={-1}
        onChange={onPick}
      />
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Screenshots (optional)</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9"
          disabled={items.length >= FEEDBACK_SCREENSHOT_MAX_COUNT}
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus aria-hidden className="size-4" />
          Add
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Up to {FEEDBACK_SCREENSHOT_MAX_COUNT} PNG, JPEG, or WebP images.
      </p>
      {items.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {items.map((item, i) => (
            <li key={item.url} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.url}
                alt={`Screenshot ${i + 1}`}
                className="size-20 rounded-md border border-border object-cover"
              />
              <button
                type="button"
                onClick={() => removeAt(i)}
                aria-label={`Remove screenshot ${i + 1}`}
                className="absolute -right-2 -top-2 rounded-full border border-border bg-background p-0.5 text-muted-foreground shadow-sm hover:text-foreground"
              >
                <X aria-hidden className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {shown ? (
        <p className={cn("text-sm text-destructive")} role="alert">
          {shown}
        </p>
      ) : null}
    </div>
  );
}
