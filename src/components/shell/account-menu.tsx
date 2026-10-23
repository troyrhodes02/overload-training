"use client";

import Link from "next/link";
import {
  EllipsisVertical,
  LogOut,
  MessageSquare,
  Settings,
  Shield,
} from "lucide-react";
import { signOutAction } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * The ⋮ menu at every width: Settings, Send feedback, and — only when the
 * server resolved the signed-in account as an admin — Admin (Admin Center &
 * Feedback design doc Screen 1). The Admin item is left out of the markup for
 * everyone else; hiding it is courtesy, and requireAdmin() is the check.
 */
export function AccountMenu({ isAdmin = false }: { isAdmin?: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Account menu">
          <EllipsisVertical className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href="/settings" className="flex w-full items-center gap-2">
            <Settings className="size-4" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/feedback" className="flex w-full items-center gap-2">
            <MessageSquare className="size-4" />
            Send feedback
          </Link>
        </DropdownMenuItem>
        {isAdmin ? (
          <DropdownMenuItem asChild>
            <Link href="/admin" className="flex w-full items-center gap-2">
              <Shield className="size-4" />
              Admin
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild>
          <form action={signOutAction}>
            <button type="submit" className="flex w-full items-center gap-2">
              <LogOut className="size-4" />
              Sign out
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
