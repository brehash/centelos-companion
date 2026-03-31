import React, { createContext, useContext } from "react";

interface ElectronAPI {
  closeWindow: () => void;
  minimizeWindow: () => void;
  hideWindow: () => void;
  setTrayBadge: (count: number) => void;
  showNotification: (opts: { title: string; body: string; type: "chat" | "call" }) => void;
  setTheme: (theme: string) => void;
  onThemeChanged: (callback: (theme: string) => void) => () => void;
  getSettings: () => Promise<{ startInTray: boolean; theme: string }>;
  setSettings: (settings: { startInTray: boolean; theme: string }) => void;
  openChat: () => void;
  openSoftphone: () => void;
  platform: string;
  isElectron: boolean;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

const ElectronContext = createContext<ElectronAPI | null>(null);

export function ElectronProvider({ children }: { children: React.ReactNode }) {
  const api = window.electronAPI || null;
  return (
    <ElectronContext.Provider value={api}>{children}</ElectronContext.Provider>
  );
}

export function useElectron() {
  return useContext(ElectronContext);
}

export const isElectron = !!window.electronAPI?.isElectron;
