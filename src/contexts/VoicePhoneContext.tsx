import React, { createContext, useContext, useCallback, useState } from "react";
import { useVoicePhonePrimary, useVoicePhoneDelegate, isElectronDelegateWindow, UseVoicePhoneReturn } from "@/hooks/useVoicePhone";
import { useBackgroundRingers, BackgroundIncoming } from "@/hooks/useBackgroundRingers";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";

interface VoicePhoneContextType extends UseVoicePhoneReturn {
  backgroundIncoming: BackgroundIncoming | null;
  acceptBackgroundCall: () => void;
  rejectBackgroundCall: () => void;
}

const VoicePhoneContext = createContext<VoicePhoneContextType | undefined>(undefined);

// Delegate provider: chat window in Electron — no Twilio Device, mirrors state via IPC
const VoicePhoneDelegateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const phone = useVoicePhoneDelegate();

  return (
    <VoicePhoneContext.Provider value={{ ...phone, backgroundIncoming: null, acceptBackgroundCall: () => {}, rejectBackgroundCall: () => {} }}>
      {children}
    </VoicePhoneContext.Provider>
  );
};

// Primary provider: softphone window or non-Electron — owns Twilio Device
const VoicePhonePrimaryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const phone = useVoicePhonePrimary();
  const { user } = useAuth();
  const { workspaces, currentWorkspace, setCurrentWorkspace } = useWorkspace();
  const [backgroundIncoming, setBackgroundIncoming] = useState<BackgroundIncoming | null>(null);

  const onSwitchWorkspace = useCallback(
    (ws: { id: string; name: string }) => {
      const targetWs = workspaces.find((w) => w.id === ws.id);
      if (targetWs) setCurrentWorkspace(targetWs);
    },
    [workspaces, setCurrentWorkspace]
  );

  const acceptBackgroundCall = useCallback(() => {
    if (!backgroundIncoming) return;
    const ws = { id: backgroundIncoming.workspaceId, name: backgroundIncoming.workspaceName };
    setBackgroundIncoming(null);
    onSwitchWorkspace(ws);
  }, [backgroundIncoming, onSwitchWorkspace]);

  const rejectBackgroundCall = useCallback(() => {
    if (!backgroundIncoming) return;
    try { backgroundIncoming.call.reject(); } catch {}
    setBackgroundIncoming(null);
  }, [backgroundIncoming]);

  const onBackgroundIncoming = useCallback((incoming: BackgroundIncoming | null) => {
    setBackgroundIncoming(incoming);
  }, []);

  useBackgroundRingers({
    workspaces: workspaces.map((ws) => ({ id: ws.id, name: ws.name })),
    currentWorkspaceId: currentWorkspace?.id ?? null,
    userId: user?.id ?? null,
    onSwitchWorkspace,
    onBackgroundIncoming,
  });

  return (
    <VoicePhoneContext.Provider value={{ ...phone, backgroundIncoming, acceptBackgroundCall, rejectBackgroundCall }}>
      {children}
    </VoicePhoneContext.Provider>
  );
};

// Router: picks the right provider based on window role
export const VoicePhoneProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (isElectronDelegateWindow()) {
    return <VoicePhoneDelegateProvider>{children}</VoicePhoneDelegateProvider>;
  }
  return <VoicePhonePrimaryProvider>{children}</VoicePhonePrimaryProvider>;
};

export const useVoicePhoneContext = () => {
  const context = useContext(VoicePhoneContext);
  if (!context) throw new Error("useVoicePhoneContext must be used within VoicePhoneProvider");
  return context;
};
