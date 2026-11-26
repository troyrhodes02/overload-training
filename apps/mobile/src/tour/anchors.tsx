import {
  createContext,
  type ComponentRef,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import {
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { clampOffset } from "./geometry";
import type { Rect } from "./types";

/**
 * Tour anchors (Pitch 21k spec §7.2, RD-13): named native views the tour can
 * measure. An anchor is registered only while its screen is focused, because
 * a tab the lifter isn't looking at stays mounted but off the window, and
 * measuring it would give a stale or detached frame. Outside a TourProvider
 * (every screen test, and anything rendered before sign-in) an anchor is a
 * plain View and registers nothing.
 */

/** Scrolls the screen that holds an anchor (its own ScrollView). */
export type TourScroller = {
  /** Scroll by `delta` points (positive moves content up). Never animated. */
  scrollBy(delta: number): void;
};

/** Measures a host view in window points, or null when it can't. */
export type TourHost = ComponentRef<typeof View>;
export type TourMeasure = (
  node: TourHost | null,
  /** The anchor's name (tests answer by name). */
  name: string,
) => Promise<Rect | null>;

export type TourAnchorEntry = {
  readonly name: string;
  readonly measure: () => Promise<Rect | null>;
  readonly scroller: TourScroller | null;
};

/** The registered anchors, newest registration first per name. */
export class TourRegistry {
  private readonly entries = new Map<string, TourAnchorEntry[]>();

  register(entry: TourAnchorEntry): () => void {
    const list = this.entries.get(entry.name) ?? [];
    this.entries.set(entry.name, [entry, ...list]);
    return () => {
      const now = this.entries.get(entry.name) ?? [];
      const rest = now.filter((e) => e !== entry);
      if (rest.length) this.entries.set(entry.name, rest);
      else this.entries.delete(entry.name);
    };
  }

  get(name: string): TourAnchorEntry | null {
    return this.entries.get(name)?.[0] ?? null;
  }

  names(): string[] {
    return [...this.entries.keys()];
  }
}

/** The real measurement: `measureInWindow` on the host view. */
export const measureInWindow: TourMeasure = (node) =>
  new Promise((resolve) => {
    if (!node) return resolve(null);
    try {
      node.measureInWindow(
        (x: number, y: number, width: number, height: number) =>
          resolve({ x, y, width, height }),
      );
    } catch {
      resolve(null);
    }
  });

export const TourRegistryContext = createContext<TourRegistry | null>(null);
export const TourMeasureContext = createContext<TourMeasure>(measureInWindow);
const TourScrollContext = createContext<TourScroller | null>(null);

/**
 * A named, measurable view. Wrap the real control: the tour points at exactly
 * what the lifter sees.
 */
export function TourAnchor({
  name,
  style,
  children,
}: {
  name: string;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const registry = useContext(TourRegistryContext);
  if (!registry) return <View style={style}>{children}</View>;
  return (
    <RegisteredAnchor name={name} registry={registry} style={style}>
      {children}
    </RegisteredAnchor>
  );
}

function RegisteredAnchor({
  name,
  registry,
  style,
  children,
}: {
  name: string;
  registry: TourRegistry;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const ref = useRef<TourHost>(null);
  const measure = useContext(TourMeasureContext);
  const scroller = useContext(TourScrollContext);
  useFocusEffect(
    useCallback(
      () =>
        registry.register({
          name,
          measure: () => measure(ref.current, name),
          scroller,
        }),
      [registry, name, measure, scroller],
    ),
  );
  return (
    <View ref={ref} collapsable={false} style={style}>
      {children}
    </View>
  );
}

/** Gives the anchors inside a screen that screen's scroller. */
export function TourScrollProvider({
  scroller,
  children,
}: {
  scroller: TourScroller;
  children: ReactNode;
}) {
  return (
    <TourScrollContext.Provider value={scroller}>
      {children}
    </TourScrollContext.Provider>
  );
}

/** UITabBar's height above the bottom safe area. */
const TAB_BAR_HEIGHT = 49;

/**
 * Lets the tour bring an off-screen anchor into view on a tab root's
 * ScrollView (RD-14). Spread `scrollProps` on the ScrollView and wrap its
 * content in `<TourScrollProvider scroller={scroller}>`. It only tracks where
 * the view is; it never scrolls on its own.
 *
 * A tab root (contentInsetAdjustmentBehavior "automatic", no navigation bar)
 * rests at minus the top safe-area inset, and iOS adds the bottom inset and
 * the tab bar below its content. Those insets are what UIKit adjusts with,
 * not the scroll view's own `contentInset` (which stays 0), so they come from
 * the safe area, never from the scroll event.
 */
export function useTourScroll(): {
  scrollProps: {
    ref: React.RefObject<ScrollViewInstance | null>;
    onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
    onLayout: (e: LayoutChangeEvent) => void;
    onContentSizeChange: (w: number, h: number) => void;
    scrollEventThrottle: number;
  };
  scroller: TourScroller;
} {
  // No provider (some screen tests): zero insets.
  const insets = useContext(SafeAreaInsetsContext) ?? { top: 0, bottom: 0 };
  const ref = useRef<ScrollViewInstance | null>(null);
  const metrics = useRef({
    offset: -insets.top,
    top: insets.top,
    bottom: insets.bottom,
    content: 0,
    layout: 0,
  });
  useLayoutEffect(() => {
    metrics.current.top = insets.top;
    metrics.current.bottom = insets.bottom;
  }, [insets.top, insets.bottom]);
  const scroller = useMemo<TourScroller>(
    () => ({
      scrollBy(delta) {
        const m = metrics.current;
        const target = clampOffset(m.offset + delta, {
          min: -m.top,
          max: m.content - m.layout + m.bottom + TAB_BAR_HEIGHT,
        });
        m.offset = target;
        ref.current?.scrollTo({ y: target, animated: false });
      },
    }),
    [],
  );
  return {
    scrollProps: {
      ref,
      scrollEventThrottle: 16,
      onScroll: (e) => {
        metrics.current.offset = e.nativeEvent.contentOffset.y;
      },
      onLayout: (e) => {
        metrics.current.layout = e.nativeEvent.layout.height;
      },
      onContentSizeChange: (_w, h) => {
        metrics.current.content = h;
      },
    },
    scroller,
  };
}
