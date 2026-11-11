"use client";

import { LogOut } from "lucide-react";
import { signOutAction } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/** The signed-in account as the navigation shows it (the acting account only). */
export type ShellAccount = {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
};

/** "JS" from Jamie Smith; else the username's or email's first letter. */
export function initialsOf(a: ShellAccount): string {
  const fromName = [a.firstName, a.lastName]
    .map((s) => s.trim().charAt(0))
    .join("");
  const fallback = (a.username || a.email).trim().charAt(0);
  return (fromName || fallback || "?").toUpperCase();
}

function fullName(a: ShellAccount): string {
  return [a.firstName, a.lastName]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
}

/**
 * The bottom of the sidebar and the phone sheet (OVE-119): the initials
 * circle, the username beneath the name, and Sign out. The circle opens a
 * small card with the account's name, username, and email — the signed-in
 * lifter's own details, nothing else.
 */
export function AccountFooter({ account }: { account: ShellAccount }) {
  const name = fullName(account);
  const handle = account.username ? `@${account.username}` : account.email;
  return (
    <div className="flex items-center gap-3 border-t border-border p-3">
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Account details"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary outline-none hover:bg-primary/15 focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {initialsOf(account)}
          </button>
        </PopoverTrigger>
        <PopoverContent side="top" align="start" className="w-64 space-y-1 p-3">
          <p className="truncate text-sm font-medium">{name || handle}</p>
          {account.username ? (
            <p className="truncate text-sm text-muted-foreground">
              @{account.username}
            </p>
          ) : null}
          <p className="truncate text-sm text-muted-foreground">
            {account.email}
          </p>
        </PopoverContent>
      </Popover>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{name || handle}</p>
        {name ? (
          <p className="truncate text-xs text-muted-foreground">{handle}</p>
        ) : null}
      </div>
      <form action={signOutAction}>
        <Button
          type="submit"
          variant="ghost"
          size="icon"
          aria-label="Sign out"
          title="Sign out"
          className="size-9 text-muted-foreground hover:text-foreground"
        >
          <LogOut aria-hidden className="size-4" />
        </Button>
      </form>
    </div>
  );
}
