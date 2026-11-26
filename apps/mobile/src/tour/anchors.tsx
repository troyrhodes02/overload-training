import {
  createContext,
  type ComponentRef,
  useCallback,
  useContext,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { clampOffset, TAB_BAR_CLEARANCE } from "./geometry";
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
export type TourMeasure = (node: TourHost | null) => Promise<Rect | null>;

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
          measure: () => measure(ref.current),
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

/**
 * Gives a screen's ScrollView to the anchors inside it, so the tour can bring
 * an off-screen target into view. Spread `scrollProps` on the ScrollView and
 * wrap its content in `Provider`. It only tracks where the view is; it never
 * scrolls on its own.
 */
export function useTourScroll(): {
  scrollProps: {
    ref: React.RefObject<ScrollViewInstance | null>;
    onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
    onLayout: (e: LayoutChangeEvent) => void;
    onContentSizeChange: (w: number, h: number) => void;
    scrollEventThrottle: number;
  };
  Provider: (props: { children: ReactNode }) => ReactNode;
} {
  const insets = useSafeAreaInsets();
  const ref = useRef<ScrollViewInstance | null>(null);
  // Until the first scroll event, a tab root rests at minus the top inset
  // (contentInsetAdjustmentBehavior "automatic" with no navigation bar).
  const metrics = useRef({
    offset: -insets.top,
    min: -insets.top,
    content: 0,
    layout: 0,
  });
  const scroller = useMemo<TourScroller>(
    () => ({
      scrollBy(delta) {
        const m = metrics.current;
        const target = clampOffset(m.offset + delta, {
          min: m.min,
          max: m.content - m.layout + insets.bottom + TAB_BAR_CLEARANCE,
        });
        m.offset = target;
        ref.current?.scrollTo({ y: target, animated: false });
      },
    }),
    [insets.bottom],
  );
  const Provider = useMemo(
    () =>
      function TourScrollProvider({ children }: { children: ReactNode }) {
        return (
          <TourScrollContext.Provider value={scroller}>
            {children}
          </TourScrollContext.Provider>
        );
      },
    [scroller],
  );
  return {
    scrollProps: {
      ref,
      scrollEventThrottle: 16,
      onScroll: (e) => {
        const y = e.nativeEvent.contentOffset.y;
        const top = e.nativeEvent.contentInset?.top;
        metrics.current.offset = y;
        if (typeof top === "number") metrics.current.min = -top;
      },
      onLayout: (e) => {
        metrics.current.layout = e.nativeEvent.layout.height;
      },
      onContentSizeChange: (_w, h) => {
        metrics.current.content = h;
      },
    },
    Provider,
  };
}
