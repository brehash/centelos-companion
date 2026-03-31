import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { isElectron } from "@/contexts/ElectronContext";

export function useChatNotifications() {
  const { user } = useAuth();
  const { workspaces, currentWorkspace, setCurrentWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const location = useLocation();
  const senderCacheRef = useRef<Record<string, string>>({});
  const groupNameCacheRef = useRef<Record<string, string>>({});
  const workspaceNameCacheRef = useRef<Record<string, string>>({});

  useEffect(() => {
    // In Electron, we use native notifications — no need to request browser permission
    if (!isElectron && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    const map: Record<string, string> = {};
    workspaces.forEach((ws) => { map[ws.id] = ws.name; });
    workspaceNameCacheRef.current = map;
  }, [workspaces]);

  const resolveSenderName = useCallback(async (senderId: string): Promise<string> => {
    if (senderCacheRef.current[senderId]) return senderCacheRef.current[senderId];
    const { data } = await supabase.from("profiles").select("full_name, email").eq("user_id", senderId).maybeSingle();
    const name = data?.full_name || data?.email || "Someone";
    senderCacheRef.current[senderId] = name;
    return name;
  }, []);

  const resolveGroupName = useCallback(async (groupId: string): Promise<string> => {
    if (groupNameCacheRef.current[groupId]) return groupNameCacheRef.current[groupId];
    const { data } = await supabase.from("chat_groups" as any).select("name").eq("id", groupId).maybeSingle();
    const name = (data as any)?.name || "Group";
    groupNameCacheRef.current[groupId] = name;
    return name;
  }, []);

  useEffect(() => {
    if (!user || workspaces.length === 0) return;

    const channels = workspaces.map((ws) => {
      return supabase
        .channel(`chat-notif-${ws.id}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `workspace_id=eq.${ws.id}` }, async (payload) => {
          const msg = payload.new as any;
          if (msg.sender_id === user.id) return;

          const isGroupMsg = !!msg.group_id;
          if (!isGroupMsg && msg.recipient_id !== user.id) return;

          // Check if viewing this conversation (desktop app uses /chat/ routes)
          if (!isGroupMsg) {
            if (currentWorkspace?.id === ws.id && location.pathname === `/chat/${msg.sender_id}`) return;
          } else {
            if (currentWorkspace?.id === ws.id && location.pathname === `/chat/group/${msg.group_id}`) return;
          }

          const senderName = await resolveSenderName(msg.sender_id);
          const wsName = workspaceNameCacheRef.current[ws.id] || "";
          const isOtherWorkspace = currentWorkspace?.id !== ws.id;
          const truncatedMsg = msg.message.length > 80 ? msg.message.slice(0, 80) + "…" : msg.message;
          let prefix = isOtherWorkspace ? `[${wsName}] ` : "";
          let title = senderName;

          if (isGroupMsg) {
            const groupName = await resolveGroupName(msg.group_id);
            title = `${senderName} in ${groupName}`;
          }

          const navPath = isGroupMsg ? `/chat/group/${msg.group_id}` : `/chat/${msg.sender_id}`;

          // In-app toast
          toast(`${prefix}${title}`, {
            description: truncatedMsg,
            dismissible: true,
            duration: 8000,
            action: {
              label: "View",
              onClick: () => {
                if (isOtherWorkspace) {
                  const targetWs = workspaces.find((w) => w.id === ws.id);
                  if (targetWs) setCurrentWorkspace(targetWs);
                }
                navigate(navPath);
              },
            },
          });

          // Native notification — use Electron API if available, else browser Notification
          if (isElectron && window.electronAPI) {
            window.electronAPI.showNotification({ title: `${prefix}${title}`, body: truncatedMsg, type: "chat" });
          } else if (!document.hasFocus() && "Notification" in window && Notification.permission === "granted") {
            const notification = new Notification(title, {
              body: `${prefix}${truncatedMsg}`,
              icon: "/favicon.ico",
              tag: isGroupMsg ? `chat-group-${msg.group_id}` : `chat-${ws.id}-${msg.sender_id}`,
            });
            notification.onclick = () => {
              window.focus();
              if (isOtherWorkspace) {
                const targetWs = workspaces.find((w) => w.id === ws.id);
                if (targetWs) setCurrentWorkspace(targetWs);
              }
              navigate(navPath);
              notification.close();
            };
            setTimeout(() => notification.close(), 6000);
          }
        })
        .subscribe();
    });

    return () => { channels.forEach((ch) => ch.unsubscribe()); };
  }, [workspaces.map((w) => w.id).join(","), user?.id, location.pathname, currentWorkspace?.id, navigate, resolveSenderName, resolveGroupName, setCurrentWorkspace]);
}
