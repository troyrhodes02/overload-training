import { useCallback, useEffect, useRef } from "react";
import { router } from "expo-router";

/**
 * Close a modal screen exactly once (Pitch 21f review, finding 1). A save can
 * finish AFTER the lifter already left the modal (Cancel, or a swipe down,
 * while the request was still out). Calling `router.back()` again then would
 * pop the screen underneath: mid-workout, that is the workout itself.
 *
 * The returned function goes back only while this screen is still mounted and
 * has not already been closed through it.
 */
export function useModalClose(): () => void {
  const open = useRef(true);
  useEffect(() => {
    open.current = true;
    return () => {
      open.current = false;
    };
  }, []);
  return useCallback(() => {
    if (!open.current) return;
    open.current = false;
    router.back();
  }, []);
}
