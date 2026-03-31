import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";

interface TypingUser {
  userId: string;
  fullName: string;
}

export interface WorkspaceTypingEntry {
  fullName: string;
  target: string;
}

const TYPING_TIMEOUT = 4000;
const TRACK_THROTTLE = 1000;

export function useTypingIndicator(
  workspaceId: string | undefined,
  channelKey: string | undefined,
  userId: string | undefined,
  fullName: string | null
) {
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);
  const lastTrackRef = useRef(0);

  useEffect(() => {
    if (!workspaceId || !channelKey || !userId) return;
    const channel = supabase.channel(`typing-${channelKey}`, { config: { presence: { key: userId } } });
    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      const users: TypingUser[] = [];
      for (const [key, presences] of Object.entries(state)) {
        if (key === userId) continue;
        const latest = (presences as any[])[0];
        if (latest?.typing) users.push({ userId: key, fullName: latest.name || "Someone" });
      }
      setTypingUsers(users);
    });
    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") await channel.track({ typing: false, name: fullName || "User" });
    });
    channelRef.current = channel;
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      channel.unsubscribe();
      channelRef.current = null;
      isTypingRef.current = false;
    };
  }, [workspaceId, channelKey, userId, fullName]);

  const broadcastTyping = useCallback(() => {
    const channel = channelRef.current;
    if (!channel) return;
    const now = Date.now();
    if (!isTypingRef.current || now - lastTrackRef.current > TRACK_THROTTLE) {
      isTypingRef.current = true;
      lastTrackRef.current = now;
      channel.track({ typing: true, name: fullName || "User" });
    }
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      channel.track({ typing: false, name: fullName || "User" });
    }, TYPING_TIMEOUT);
  }, [fullName]);

  const stopTyping = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    isTypingRef.current = false;
    channelRef.current?.track({ typing: false, name: fullName || "User" });
  }, [fullName]);

  return { typingUsers, broadcastTyping, stopTyping };
}

export function useWorkspaceTypingPresence(
  workspaceId: string | undefined,
  userId: string | undefined,
  fullName: string | null
) {
  const [typingMap, setTypingMap] = useState<Map<string, WorkspaceTypingEntry>>(new Map());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);
  const currentTargetRef = useRef<string>("");
  const lastTrackRef = useRef(0);

  useEffect(() => {
    if (!workspaceId || !userId) return;
    const channel = supabase.channel(`typing-ws-${workspaceId}`, { config: { presence: { key: userId } } });
    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      const map = new Map<string, WorkspaceTypingEntry>();
      for (const [key, presences] of Object.entries(state)) {
        if (key === userId) continue;
        const latest = (presences as any[])[0];
        if (latest?.typing && latest?.target) map.set(key, { fullName: latest.name || "Someone", target: latest.target });
      }
      setTypingMap(map);
    });
    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") await channel.track({ typing: false, name: fullName || "User", target: "" });
    });
    channelRef.current = channel;
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      channel.unsubscribe();
      channelRef.current = null;
      isTypingRef.current = false;
    };
  }, [workspaceId, userId, fullName]);

  const broadcastTyping = useCallback((target: string) => {
    const channel = channelRef.current;
    if (!channel) return;
    const now = Date.now();
    if (!isTypingRef.current || currentTargetRef.current !== target || now - lastTrackRef.current > TRACK_THROTTLE) {
      isTypingRef.current = true;
      currentTargetRef.current = target;
      lastTrackRef.current = now;
      channel.track({ typing: true, name: fullName || "User", target });
    }
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      currentTargetRef.current = "";
      channel.track({ typing: false, name: fullName || "User", target: "" });
    }, TYPING_TIMEOUT);
  }, [fullName]);

  const stopTyping = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    isTypingRef.current = false;
    currentTargetRef.current = "";
    channelRef.current?.track({ typing: false, name: fullName || "User", target: "" });
  }, [fullName]);

  return { typingMap, broadcastTyping, stopTyping };
}
