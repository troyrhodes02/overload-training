"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";

/**
 * Shows a one-time success toast after a create action redirected here with
 * `?created=1`, then strips the flag so a reload doesn't repeat it.
 */
export function CreatedToast({
  show,
  message,
}: {
  show: boolean;
  message: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const shown = useRef(false);

  useEffect(() => {
    if (!show || shown.current) return;
    shown.current = true;
    toast.success(message, { duration: 4000 });
    router.replace(pathname, { scroll: false });
  }, [show, message, pathname, router]);

  return null;
}
