"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * shadcn/ui's toast (Sonner), themed from Overload's tokens. The app shell
 * passes the account's appearance as `theme` (Light, Dark, or System); without
 * one it follows the device. No theme provider dependency is needed.
 */
export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="system"
      position="bottom-center"
      // Sit above the phone thumb-reach action bars (fixed to the bottom edge).
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
