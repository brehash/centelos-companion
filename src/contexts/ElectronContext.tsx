import React, { createContext, useContext } from "react";

export interface CrossWindowCallState {
  callStatus: "idle" | "ringing-in" | "ringing-out" | "in-call";
  incomingFrom: string | null;
  isMuted: boolean;
  isOnHold: boolean;
  callDuration: number;
  extensionNumber: string | null;
  dialedTarget: string | null;
  callDirection: "inbound" | "outbound" | null;
  phoneStatus: "offline" | "connecting" | "registered" | "error";
}

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
  onNotificationAction: (callback: (action: string) => void) => () => void;

  // Cross-window call IPC
  requestCall: (number: string) => void;
  requestHangup: () => void;
  requestAcceptCall: () => void;
  requestRejectCall: () => void;
  focusSoftphone: () => void;
  broadcastCallState: (state: CrossWindowCallState) => void;
  onCallStateChanged: (callback: (state: CrossWindowCallState) => void) => () => void;
  onCallMakeRequest: (callback: (number: string) => void) => () => void;
  onCallHangupRequest: (callback: () => void) => () => void;
  onCallAcceptRequest: (callback: () => void) => () => void;
  onCallRejectRequest: (callback: () => void) => () => void;

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
