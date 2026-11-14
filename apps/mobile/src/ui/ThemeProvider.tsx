import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Appearance as RNAppearance, useColorScheme } from "react-native";
import * as SystemUI from "expo-system-ui";
import {
  DEFAULT_APPEARANCE,
  isAppearance,
  type Appearance,
} from "@overload/shared/appearance/appearance";
import {
  readAppearanceMirror,
  writeAppearanceMirror,
} from "./appearance-mirror";
import { buildTheme, resolveScheme, type Theme } from "./theme";

type ThemeContextValue = {
  theme: Theme;
  preference: Appearance;
  /** Apply a preference now (from `me`, or a choice just made in More). */
  setPreference: (next: Appearance) => void;
  /** True once the device mirror has been read (first paint is decided). */
  ready: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreferenceState] =
    useState<Appearance>(DEFAULT_APPEARANCE);
  const [ready, setReady] = useState(false);

  // First paint: the last preference applied on this device. Never
  // authoritative; `me` replaces it once signed in (design §3).
  useEffect(() => {
    let live = true;
    readAppearanceMirror().then((stored) => {
      if (!live) return;
      if (isAppearance(stored)) setPreferenceState(stored);
      setReady(true);
    });
    return () => {
      live = false;
    };
  }, []);

  const scheme = resolveScheme(preference, system);
  const theme = useMemo(() => buildTheme(scheme), [scheme]);

  // Native surfaces (tab bar, alerts, keyboards, status bar) follow too.
  useEffect(() => {
    RNAppearance.setColorScheme(
      preference === "system" ? "unspecified" : preference,
    );
  }, [preference]);
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.colors.background).catch(() => {});
  }, [theme.colors.background]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      preference,
      ready,
      setPreference: (next) => {
        setPreferenceState(next);
        writeAppearanceMirror(next);
      },
    }),
    [theme, preference, ready],
  );
  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useThemeContext(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme outside ThemeProvider");
  return value;
}

export function useTheme(): Theme {
  return useThemeContext().theme;
}
