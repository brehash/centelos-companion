import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

export type PresenceStatus = "available" | "away" | "dnd" | "in-call";
export type DeskPhoneStatus = "none" | "active" | "inactive";

export interface PresenceMember {
  user_id: string;
  is_online: boolean;
  last_seen_at: string;
  full_name: string | null;
  email: string | null;
  status: PresenceStatus;
  extension_number: string | null;
  desk_phone_status: DeskPhoneStatus;
}

interface TrackedPayload {
  user_id: string;
  status: PresenceStatus;
  full_name: string | null;
  email: string | null;
}

interface PresenceContextValue {
  members: PresenceMember[];
  myStatus: PresenceStatus;
  updateStatus: (newStatus: PresenceStatus) => Promise<void>;
  setInCall: (active: boolean) => void;
}

const PresenceContext = createContext<PresenceContextValue | null>(null);

const PRESENCE_STATUS_KEY = "presence-status";
const DB_SYNC_INTERVAL = 5 * 60_000;

export function usePresenceContext(): PresenceContextValue {
  const ctx = useContext(PresenceContext);
  if (!ctx) {
    return {
      members: [],
      myStatus: "available",
      updateStatus: async () => {},
      setInCall: () => {},
    };
  }
  return ctx;
}

export const PresenceProvider: React.FC<{
  workspaceId: string | undefined;
  children: React.ReactNode;
}> = ({ workspaceId, children }) => {
  const { user } = useAuth();
  const [members, setMembers] = useState<PresenceMember[]>([]);
  const [myStatus, setMyStatus] = useState<PresenceStatus>(() => {
    return (localStorage.getItem(PRESENCE_STATUS_KEY) as PresenceStatus) || "available";
  });

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const profileCacheRef = useRef<Map<string, { full_name: string | null; email: string | null }>>(new Map());
  const extensionCacheRef = useRef<Map<string, string>>(new Map());
  const deskPhoneMapRef = useRef<Map<string, DeskPhoneStatus>>(new Map());
  const dbStatusRef = useRef<Map<string, PresenceStatus>>(new Map());
  const dbOnlineRef = useRef<Map<string, boolean>>(new Map());
  const myStatusRef = useRef<PresenceStatus>(myStatus);
  const inCallRef = useRef(false);
  const initialStatusFetchedRef = useRef(false);

  useEffect(() => { myStatusRef.current = myStatus; }, [myStatus]);

  // Cross-tab sync
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === PRESENCE_STATUS_KEY && e.newValue) {
        const newStatus = e.newValue as PresenceStatus;
        setMyStatus(newStatus);
        myStatusRef.current = newStatus;
        channelRef.current?.track({ user_id: user?.id, status: newStatus, full_name: null, email: null });
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [user?.id]);

  // Fetch initial status from DB
  useEffect(() => {
    if (!workspaceId || !user || initialStatusFetchedRef.current) return;
    initialStatusFetchedRef.current = true;
    (async () => {
      const { data } = await supabase
        .from("presence")
        .select("status")
        .eq("workspace_id", workspaceId)
        .eq("user_id", user.id)
        .maybeSingle();
      const dbStatus = data?.status as PresenceStatus | undefined;
      const savedStatus = dbStatus || (localStorage.getItem(PRESENCE_STATUS_KEY) as PresenceStatus) || "available";
      setMyStatus(savedStatus);
      myStatusRef.current = savedStatus;
      localStorage.setItem(PRESENCE_STATUS_KEY, savedStatus);
    })();
  }, [workspaceId, user?.id]);

  useEffect(() => { initialStatusFetchedRef.current = false; }, [workspaceId]);

  const fetchEnrichmentData = useCallback(async () => {
    if (!workspaceId) return;
    const { data: memberships } = await supabase.from("memberships").select("user_id").eq("workspace_id", workspaceId);
    if (!memberships?.length) return;
    const userIds = memberships.map((m) => m.user_id);
    const [profilesRes, extensionsRes] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name, email").in("user_id", userIds),
      supabase.from("extensions").select("user_id, extension_number, id").eq("workspace_id", workspaceId),
    ]);
    const pCache = new Map<string, { full_name: string | null; email: string | null }>();
    (profilesRes.data || []).forEach((p) => pCache.set(p.user_id, { full_name: p.full_name, email: p.email }));
    profileCacheRef.current = pCache;
    const eCache = new Map<string, string>();
    ((extensionsRes.data as any[]) || []).forEach((e: any) => {
      if (e.user_id) eCache.set(e.user_id, e.extension_number);
    });
    extensionCacheRef.current = eCache;
  }, [workspaceId]);

  const rebuildMembers = useCallback(() => {
    if (!user) return;
    const channel = channelRef.current;
    const onlineMap = new Map<string, TrackedPayload>();
    if (channel) {
      const state = channel.presenceState<TrackedPayload>();
      for (const [, presences] of Object.entries(state)) {
        const presence = presences[0] as unknown as TrackedPayload;
        if (presence?.user_id) onlineMap.set(presence.user_id, presence);
      }
    }
    const result: PresenceMember[] = [];
    for (const [userId, profile] of profileCacheRef.current.entries()) {
      if (userId === user.id) continue;
      const onlinePresence = onlineMap.get(userId);
      const realtimeStatus = onlinePresence?.status || "available";
      const dbStatus = dbStatusRef.current.get(userId);
      const finalStatus: PresenceStatus =
        dbStatus === "in-call" || realtimeStatus === "in-call" ? "in-call" :
        dbStatus === "dnd" || realtimeStatus === "dnd" ? "dnd" :
        dbStatus === "away" || realtimeStatus === "away" ? "away" : realtimeStatus;
      result.push({
        user_id: userId,
        is_online: !!onlinePresence || dbOnlineRef.current.get(userId) === true || dbStatus === "in-call",
        last_seen_at: new Date().toISOString(),
        full_name: onlinePresence?.full_name || profile.full_name || null,
        email: onlinePresence?.email || profile.email || null,
        status: finalStatus,
        extension_number: extensionCacheRef.current.get(userId) || null,
        desk_phone_status: deskPhoneMapRef.current.get(userId) || "none",
      });
    }
    result.sort((a, b) => {
      if (a.is_online !== b.is_online) return a.is_online ? -1 : 1;
      const order: Record<PresenceStatus, number> = { available: 0, "in-call": 0, away: 1, dnd: 2 };
      return (order[a.status] || 0) - (order[b.status] || 0);
    });
    setMembers(result);
  }, [user?.id]);

  const persistToDb = useCallback(async (online: boolean, status?: PresenceStatus) => {
    if (!user || !workspaceId) return;
    const currentStatus = status || (localStorage.getItem(PRESENCE_STATUS_KEY) as PresenceStatus) || "available";
    await supabase.from("presence").upsert(
      { workspace_id: workspaceId, user_id: user.id, last_seen_at: new Date().toISOString(), is_online: online, status: currentStatus },
      { onConflict: "workspace_id,user_id" }
    ).then(({ error }) => { if (error) console.error("Presence DB persist error:", error.message); });
  }, [user, workspaceId]);

  const updateStatus = useCallback(async (newStatus: PresenceStatus) => {
    if (inCallRef.current) { localStorage.setItem(PRESENCE_STATUS_KEY, newStatus); return; }
    setMyStatus(newStatus);
    myStatusRef.current = newStatus;
    localStorage.setItem(PRESENCE_STATUS_KEY, newStatus);
    const profile = user ? profileCacheRef.current.get(user.id) : null;
    channelRef.current?.track({ user_id: user?.id, status: newStatus, full_name: profile?.full_name || null, email: profile?.email || null });
    persistToDb(true, newStatus);
  }, [user, persistToDb]);

  const setInCall = useCallback((active: boolean) => {
    if (active) {
      inCallRef.current = true;
      setMyStatus("in-call");
      myStatusRef.current = "in-call";
      const profile = user ? profileCacheRef.current.get(user.id) : null;
      channelRef.current?.track({ user_id: user?.id, status: "in-call", full_name: profile?.full_name || null, email: profile?.email || null });
      persistToDb(true, "in-call");
    } else {
      inCallRef.current = false;
      const savedStatus = (localStorage.getItem(PRESENCE_STATUS_KEY) as PresenceStatus) || "available";
      setMyStatus(savedStatus);
      myStatusRef.current = savedStatus;
      const profile = user ? profileCacheRef.current.get(user.id) : null;
      channelRef.current?.track({ user_id: user?.id, status: savedStatus, full_name: profile?.full_name || null, email: profile?.email || null });
      persistToDb(true, savedStatus);
    }
  }, [user, persistToDb]);

  // Main channel effect
  useEffect(() => {
    if (!workspaceId || !user) return;
    fetchEnrichmentData().then(() => rebuildMembers());
    const channelName = `presence-rt-${workspaceId}`;
    const channel = supabase.channel(channelName);
    channelRef.current = channel;

    channel
      .on("presence", { event: "sync" }, () => rebuildMembers())
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          const currentStatus = myStatusRef.current;
          const profile = profileCacheRef.current.get(user.id);
          await channel.track({ user_id: user.id, status: currentStatus, full_name: profile?.full_name || null, email: profile?.email || null });
          persistToDb(true, currentStatus);
        }
      });

    const dbChannel = supabase.channel(`presence-db-${workspaceId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "presence", filter: `workspace_id=eq.${workspaceId}` }, (payload) => {
        const newRow = payload.new as { user_id: string; status: string; is_online: boolean };
        dbStatusRef.current.set(newRow.user_id, newRow.status as PresenceStatus);
        dbOnlineRef.current.set(newRow.user_id, newRow.is_online);
        if (newRow.user_id === user.id) {
          const newStatus = newRow.status as PresenceStatus;
          if (inCallRef.current && newStatus !== "in-call") { /* skip */ }
          else if (newStatus !== myStatusRef.current) {
            setMyStatus(newStatus);
            myStatusRef.current = newStatus;
            const profile = profileCacheRef.current.get(user.id);
            channelRef.current?.track({ user_id: user.id, status: newStatus, full_name: profile?.full_name || null, email: profile?.email || null });
          }
        }
        rebuildMembers();
      })
      .subscribe();

    const dbSyncInterval = setInterval(() => persistToDb(true), DB_SYNC_INTERVAL);
    const enrichmentInterval = setInterval(() => { fetchEnrichmentData().then(() => rebuildMembers()); }, 5 * 60_000);

    const handleVisibility = () => {
      if (document.visibilityState === "visible" && channelRef.current) {
        const currentStatus = myStatusRef.current;
        const profile = profileCacheRef.current.get(user.id);
        channelRef.current.track({ user_id: user.id, status: currentStatus, full_name: profile?.full_name || null, email: profile?.email || null });
        persistToDb(true, currentStatus);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    const handleBeforeUnload = () => persistToDb(false);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      clearInterval(dbSyncInterval);
      clearInterval(enrichmentInterval);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      channel.unsubscribe();
      dbChannel.unsubscribe();
      channelRef.current = null;
    };
  }, [workspaceId, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <PresenceContext.Provider value={{ members, myStatus, updateStatus, setInCall }}>
      {children}
    </PresenceContext.Provider>
  );
};
