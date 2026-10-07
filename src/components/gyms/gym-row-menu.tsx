"use client";

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { archiveGymAction, restoreGymAction } from "@/app/(app)/gyms/actions";
import { ArchiveDialog } from "@/components/archive/archive-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function GymRowMenu({ gymId, name }: { gymId: string; name: string }) {
  const [archiveOpen, setArchiveOpen] = useState(false);
  return (
    <>
      {/* Non-modal: opening a modal Dialog from a modal menu item can leave
          the page with pointer-events disabled (known Radix interaction). */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-11 shrink-0"
            aria-label={`Actions for ${name}`}
          >
            <MoreHorizontal aria-hidden className="size-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setArchiveOpen(true)}>
            Archive gym
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ArchiveDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        name={name}
        body="It won't appear when you pick a gym. Past workouts keep it."
        archive={() => archiveGymAction(gymId)}
        restore={() => restoreGymAction(gymId)}
      />
    </>
  );
}
