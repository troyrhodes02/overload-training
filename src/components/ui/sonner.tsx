"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * shadcn/ui's toast (Sonner), themed from Overload's tokens. Follows the system
 * appearance (Overload has no in-app theme toggle yet), so no theme provider
 * dependency is needed.
 */
export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="system"
      position="bottom-center"
      // Sit above the fixed mobile bottom nav.
      offset={{ bottom: 80 }}
      mobileOffset={{ bottom: 80 }}
      toastOptions={{
        classNames: {
          toast:
            "!bg-popover !text-popover-foreground !border-border !shadow-md",
          description: "!text-muted-foreground",
          actionButton: "!bg-primary !text-primary-foreground",
        },
      }}
      {...props}
    />
  );
}
