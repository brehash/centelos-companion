import { useEffect, useRef, useCallback } from "react";
import { Device, Call } from "@twilio/voice-sdk";
import { supabase } from "@/lib/supabase";
import { isElectron } from "@/contexts/ElectronContext";

interface Workspace { id: string; name: string; }

export interface BackgroundIncoming {
  workspaceId: string;
  workspaceName: string;
  from: string;
  call: Call;
}

interface BackgroundRingerEntry {
  workspaceId: string;
  device: Device;
  credentials: { sip_username: string; sip_password: string };
}

interface UseBackgroundRingersOptions {
  workspaces: Workspace[];
  currentWorkspaceId: string | null;
  userId: string | null;
  onSwitchWorkspace: (ws: Workspace) => void;
  onBackgroundIncoming: (incoming: BackgroundIncoming | null) => void;
}

export function useBackgroundRingers({ workspaces, currentWorkspaceId, userId, onSwitchWorkspace, onBackgroundIncoming }: UseBackgroundRingersOptions) {
  const ringersRef = useRef<BackgroundRingerEntry[]>([]);
  const destroyedRef = useRef(false);

  const fetchTokenForCreds = useCallback(async (creds: { sip_username: string; sip_password: string }): Promise<string | null> => {
    try {
      const { data, error } = await supabase.functions.invoke("generate-voice-token", { body: { sip_username: creds.sip_username, sip_password: creds.sip_password } });
      if (error || data?.error) return null;
      return data.token;
    } catch { return null; }
  }, []);

  const destroyAllRingers = useCallback(() => {
    ringersRef.current.forEach((r) => { try { r.device.destroy(); } catch {} });
    ringersRef.current = [];
    onBackgroundIncoming(null);
  }, [onBackgroundIncoming]);

  useEffect(() => {
    if (!userId || !currentWorkspaceId || workspaces.length <= 1) { destroyAllRingers(); return; }

    destroyedRef.current = false;
    const otherWorkspaces = workspaces.filter((ws) => ws.id !== currentWorkspaceId);

    const initRingers = async () => {
      destroyAllRingers();
      for (const ws of otherWorkspaces) {
        if (destroyedRef.current) break;
        try {
          const { data, error } = await supabase.functions.invoke("manage-extensions", { body: { action: "get_my_extension", workspace_id: ws.id } });
          if (error || data?.error || !data?.extension || !data?.device) continue;
          const creds = { sip_username: data.device.sip_username, sip_password: data.device.sip_password };
          const token = await fetchTokenForCreds(creds);
          if (!token || destroyedRef.current) continue;
          const bgDevice = new Device(token, { codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU], closeProtection: false });

          bgDevice.on("incoming", (call: Call) => {
            if (destroyedRef.current) return;
            const from = call.parameters?.From || "Unknown";
            onBackgroundIncoming({ workspaceId: ws.id, workspaceName: ws.name, from, call });

            // Native notification
            if (isElectron && window.electronAPI) {
              window.electronAPI.showNotification({ title: "Incoming Call", body: `[${ws.name}] ${from}`, type: "call" });
            } else if (!document.hasFocus() && "Notification" in window && Notification.permission === "granted") {
              const notification = new Notification("Incoming Call", { body: `[${ws.name}] ${from}`, icon: "/favicon.ico", tag: `call-${ws.id}` });
              notification.onclick = () => { window.focus(); onSwitchWorkspace(ws); notification.close(); };
              setTimeout(() => notification.close(), 30000);
              call.on("cancel", () => notification.close());
              call.on("disconnect", () => notification.close());
              call.on("reject", () => notification.close());
            }

            call.on("cancel", () => onBackgroundIncoming(null));
            call.on("disconnect", () => onBackgroundIncoming(null));
            call.on("reject", () => onBackgroundIncoming(null));
          });

          bgDevice.on("tokenWillExpire", async () => { const newToken = await fetchTokenForCreds(creds); if (newToken) bgDevice.updateToken(newToken); });
          bgDevice.on("error", (err: any) => { console.warn(`Background ringer error for workspace ${ws.name}:`, err?.message); });

          await bgDevice.register();
          ringersRef.current.push({ workspaceId: ws.id, device: bgDevice, credentials: creds });
        } catch (err) { console.warn(`Failed to register background ringer for workspace ${ws.name}:`, err); }
      }
    };

    initRingers();
    return () => { destroyedRef.current = true; destroyAllRingers(); };
  }, [userId, currentWorkspaceId, workspaces.map((w) => w.id).join(","), fetchTokenForCreds, destroyAllRingers, onSwitchWorkspace, onBackgroundIncoming]);
}
