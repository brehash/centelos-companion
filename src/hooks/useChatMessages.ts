import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient, useQuery } from "@tanstack/react-query";

const PAGE_SIZE = 40;

export interface ChatMessage {
  id: string;
  workspace_id: string;
  sender_id: string;
  recipient_id: string | null;
  group_id: string | null;
  message: string;
  is_read: boolean;
  created_at: string;
  file_url: string | null;
  file_name: string | null;
  deleted_at: string | null;
  edited_at: string | null;
  reply_to_id: string | null;
  forwarded_from_id: string | null;
}

export function useChatMessages(
  workspaceId: string | undefined,
  recipientId: string | null,
  groupId?: string | null
) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const isGroup = !!groupId;

  const buildQuery = useCallback((beforeCursor?: string) => {
    let query = supabase
      .from("chat_messages")
      .select("*")
      .eq("workspace_id", workspaceId!)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);
    if (beforeCursor) query = query.lt("created_at", beforeCursor);
    if (isGroup) {
      query = query.eq("group_id", groupId!);
    } else {
      query = query.is("group_id", null)
        .or(`and(sender_id.eq.${user!.id},recipient_id.eq.${recipientId}),and(sender_id.eq.${recipientId},recipient_id.eq.${user!.id})`);
    }
    return query;
  }, [workspaceId, recipientId, groupId, user?.id, isGroup]);

  const fetchMessages = useCallback(async () => {
    if (!workspaceId || !user) return;
    if (!isGroup && !recipientId) return;
    setLoading(true);
    const { data } = await buildQuery();
    const sorted = ((data as any as ChatMessage[]) || []).reverse();
    setMessages(sorted);
    setHasMore(sorted.length >= PAGE_SIZE);
    setLoading(false);
  }, [workspaceId, recipientId, groupId, user?.id, buildQuery]);

  const loadMore = useCallback(async () => {
    if (!workspaceId || !user || !hasMore || loadingMore || messages.length === 0) return;
    const oldestCreatedAt = messages[0]?.created_at;
    if (!oldestCreatedAt) return;
    setLoadingMore(true);
    const { data } = await buildQuery(oldestCreatedAt);
    const older = ((data as any as ChatMessage[]) || []).reverse();
    if (older.length < PAGE_SIZE) setHasMore(false);
    if (older.length > 0) setMessages((prev) => [...older, ...prev]);
    setLoadingMore(false);
  }, [workspaceId, user?.id, hasMore, loadingMore, messages, buildQuery]);

  const markRead = useCallback(async () => {
    if (!workspaceId || !user) return;
    if (isGroup) {
      await supabase.from("chat_messages").update({ is_read: true } as any)
        .eq("workspace_id", workspaceId).eq("group_id", groupId!).neq("sender_id", user.id).eq("is_read", false);
    } else if (recipientId) {
      await supabase.from("chat_messages").update({ is_read: true })
        .eq("workspace_id", workspaceId).eq("sender_id", recipientId).eq("recipient_id", user.id).eq("is_read", false);
    }
  }, [workspaceId, recipientId, groupId, user?.id]);

  useEffect(() => { fetchMessages(); markRead(); }, [fetchMessages, markRead]);

  // Realtime
  useEffect(() => {
    if (!workspaceId || !user) return;
    const channelName = isGroup ? `chat-group-${groupId}` : `chat-${workspaceId}-${recipientId}`;
    const channel = supabase.channel(channelName)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `workspace_id=eq.${workspaceId}` }, (payload) => {
        const msg = payload.new as any as ChatMessage;
        if (isGroup) {
          if (msg.group_id === groupId) { setMessages((prev) => [...prev, msg]); if (msg.sender_id !== user.id) markRead(); }
        } else {
          if (msg.group_id === null && ((msg.sender_id === user.id && msg.recipient_id === recipientId) || (msg.sender_id === recipientId && msg.recipient_id === user.id))) {
            setMessages((prev) => [...prev, msg]);
            if (msg.recipient_id === user.id) markRead();
          }
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_messages", filter: `workspace_id=eq.${workspaceId}` }, (payload) => {
        const updated = payload.new as any as ChatMessage;
        setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      })
      .subscribe();
    return () => { channel.unsubscribe(); };
  }, [workspaceId, recipientId, groupId, user?.id, markRead]);

  const sendMessage = useCallback(async (text: string, file?: { url: string; name: string }, replyToId?: string) => {
    if (!workspaceId || !user) return;
    if (!text.trim() && !file) return;
    const row: any = {
      workspace_id: workspaceId, sender_id: user.id,
      message: text.trim() || (file ? file.name : ""),
      file_url: file?.url ?? null, file_name: file?.name ?? null,
      reply_to_id: replyToId ?? null,
    };
    if (isGroup) { row.group_id = groupId; row.recipient_id = null; }
    else { row.recipient_id = recipientId; row.group_id = null; }
    await supabase.from("chat_messages").insert(row as any);
  }, [workspaceId, recipientId, groupId, user?.id]);

  const editMessage = useCallback(async (messageId: string, newText: string) => {
    if (!user) return;
    await supabase.from("chat_messages").update({ message: newText, edited_at: new Date().toISOString() } as any).eq("id", messageId).eq("sender_id", user.id);
  }, [user?.id]);

  const deleteMessage = useCallback(async (messageId: string) => {
    if (!user) return;
    await supabase.from("chat_messages").update({ deleted_at: new Date().toISOString() } as any).eq("id", messageId);
  }, [user?.id]);

  const restoreMessage = useCallback(async (messageId: string) => {
    if (!user) return;
    await supabase.from("chat_messages").update({ deleted_at: null } as any).eq("id", messageId).eq("sender_id", user.id);
  }, [user?.id]);

  const forwardMessage = useCallback(async (originalMessage: ChatMessage, targetUserId: string) => {
    if (!workspaceId || !user) return;
    await supabase.from("chat_messages").insert({
      workspace_id: workspaceId, sender_id: user.id, recipient_id: targetUserId, group_id: null,
      message: originalMessage.message, file_url: originalMessage.file_url, file_name: originalMessage.file_name,
      forwarded_from_id: originalMessage.id,
    } as any);
  }, [workspaceId, user?.id]);

  return { messages, loading, loadingMore, hasMore, loadMore, sendMessage, editMessage, deleteMessage, restoreMessage, forwardMessage };
}

export function useUnreadCount(workspaceId: string | undefined) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: count = 0 } = useQuery({
    queryKey: ["unread-count", workspaceId],
    queryFn: async () => {
      if (!workspaceId || !user) return 0;
      const { count: dmCount } = await supabase.from("chat_messages" as any).select("*", { count: "exact", head: true })
        .eq("workspace_id", workspaceId).eq("recipient_id", user.id).is("group_id", null).is("deleted_at", null).eq("is_read", false);
      const { count: groupCount } = await supabase.from("chat_messages" as any).select("*", { count: "exact", head: true })
        .eq("workspace_id", workspaceId).not("group_id", "is", null).neq("sender_id", user.id).is("deleted_at", null).eq("is_read", false);
      return (dmCount || 0) + (groupCount || 0);
    },
    enabled: !!workspaceId && !!user,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  useEffect(() => {
    if (!workspaceId || !user) return;
    const channel = supabase.channel(`unread-${workspaceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages", filter: `workspace_id=eq.${workspaceId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["unread-count", workspaceId] });
      }).subscribe();
    return () => { channel.unsubscribe(); };
  }, [workspaceId, user?.id, queryClient]);

  return count;
}

export function useGlobalUnreadCount(workspaceIds: string[]) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const key = workspaceIds.join(",");
  const { data: count = 0 } = useQuery({
    queryKey: ["global-unread-count", key],
    queryFn: async () => {
      if (!user || workspaceIds.length === 0) return 0;
      const { count: dmCount } = await supabase.from("chat_messages" as any).select("*", { count: "exact", head: true })
        .in("workspace_id", workspaceIds).eq("recipient_id", user.id).is("group_id", null).is("deleted_at", null).eq("is_read", false);
      const { count: groupCount } = await supabase.from("chat_messages" as any).select("*", { count: "exact", head: true })
        .in("workspace_id", workspaceIds).not("group_id", "is", null).neq("sender_id", user.id).is("deleted_at", null).eq("is_read", false);
      return (dmCount || 0) + (groupCount || 0);
    },
    enabled: !!user && workspaceIds.length > 0,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  useEffect(() => {
    if (!user || workspaceIds.length === 0) return;
    const channels = workspaceIds.map((wsId) =>
      supabase.channel(`global-unread-${wsId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages", filter: `workspace_id=eq.${wsId}` }, () => {
          queryClient.invalidateQueries({ queryKey: ["global-unread-count", key] });
        }).subscribe()
    );
    return () => { channels.forEach((ch) => ch.unsubscribe()); };
  }, [key, user?.id, queryClient]);

  return count;
}
