import { useCallback, useEffect, useRef, type RefObject } from "react";
import {
  Keyboard,
  type HostInstance,
  type ScrollViewInstance,
} from "react-native";

/**
 * How far to scroll so a row (window coordinates) sits `margin` above the
 * keyboard's top edge, never pushing the row's top above the scroll view's
 * visible top. 0 when the row is already clear (OVE-213).
 */
export function revealShift(m: {
  rowTop: number;
  rowBottom: number;
  keyboardTop: number;
  visibleTop: number;
  margin: number;
}): number {
  const over = m.rowBottom + m.margin - m.keyboardTop;
  if (over <= 0) return 0;
  const room = Math.max(0, m.rowTop - m.visibleTop - m.margin);
  return Math.min(over, room);
}

/**
 * Keeps one row (the active set: its inputs, caption, and any error) above
 * the keyboard and its keypad bar (OVE-213). React Native's own keyboard
 * insets scroll only the focused input into view, and only when the keyboard
 * frame changes; this also covers what sits under the input and a row that
 * moves or grows while the keyboard stays up. Everything is measured, never a
 * fixed offset, so name length, set count, Dynamic Type, and screen size
 * don't matter. The scroll offset is measured too (the visible top minus the
 * content's top), never tracked from throttled scroll events.
 */
export function useKeepAboveKeyboard(
  scroll: RefObject<ScrollViewInstance | null>,
  margin: number,
) {
  const row = useRef<HostInstance | null>(null);
  /** A View wrapping all of the scroll view's content. */
  const content = useRef<HostInstance | null>(null);
  const keyboardTop = useRef<number | null>(null);

  const reveal = useCallback(() => {
    const top = keyboardTop.current;
    const node = row.current;
    const inner = content.current;
    const view = scroll.current;
    if (top === null || !node || !inner || !view) return;
    view.measureInWindow((_sx, visibleTop) => {
      inner.measureInWindow((_cx, contentTop) => {
        node.measureInWindow((_x, y, _w, h) => {
          const shift = revealShift({
            rowTop: y,
            rowBottom: y + h,
            keyboardTop: top,
            visibleTop,
            margin,
          });
          if (shift > 0) {
            // Content y 0 sits at visibleTop - offset in the window.
            const offset = visibleTop - contentTop;
            view.scrollTo({ y: offset + shift, animated: true });
          }
        });
      });
    });
  }, [scroll, margin]);

  useEffect(() => {
    const subs = [
      Keyboard.addListener("keyboardDidShow", (e) => {
        keyboardTop.current = e.endCoordinates.screenY;
        reveal();
      }),
      Keyboard.addListener("keyboardWillHide", () => {
        keyboardTop.current = null;
      }),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [reveal]);

  /**
   * The keyboard is being put away on purpose (the card closes it after a
   * save, Pitch 25 OVE-274): forget its position now, so a row laid out
   * before keyboardWillHide arrives isn't scrolled against a closing keyboard.
   */
  const forget = useCallback(() => {
    keyboardTop.current = null;
  }, []);

  return { row, content, reveal, forget };
}
