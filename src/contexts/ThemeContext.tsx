import React, { createContext, useContext, useEffect, useState } from "react";
import { useElectron } from "./ElectronContext";

type Theme = "light" | "dark" | "system";

interface ThemeContextType {
  theme: Theme;
  setTheme: (t: Theme) => void;
  resolvedTheme: "light" | "dark";
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "system",
  setTheme: () => {},
  resolvedTheme: "light",
});

function getSystemTheme(): "light" | "dark" {
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const electron = useElectron();
  const [theme, setThemeState] = useState<Theme>("system");

  useEffect(() => {
    // Load saved theme
    if (electron) {
      electron.getSettings().then((s) => {
        if (s?.theme) setThemeState(s.theme as Theme);
      });
      const unsub = electron.onThemeChanged((t) => setThemeState(t as Theme));
      return unsub;
    } else {
      const saved = localStorage.getItem("centelos-theme") as Theme | null;
      if (saved) setThemeState(saved);
    }
  }, [electron]);

  const resolvedTheme = theme === "system" ? getSystemTheme() : theme;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
  }, [resolvedTheme]);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    if (electron) {
      electron.setTheme(t);
      electron.getSettings().then((s) => {
        electron.setSettings({ ...s, theme: t });
      });
    } else {
      localStorage.setItem("centelos-theme", t);
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
