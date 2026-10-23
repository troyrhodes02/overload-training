"use client";

import Link from "next/link";
import {
  EllipsisVertical,
  LogOut,
  MessageSquare,
  Settings,
} from "lucide-react";
import { signOutAction } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AccountMenu() {
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
