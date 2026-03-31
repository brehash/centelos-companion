import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { PresenceMember, PresenceStatus } from "@/contexts/PresenceContext";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageCircle, Plus, Users, Search, X, ChevronDown } from "lucide-react";
import CreateGroupDialog from "@/components/CreateGroupDialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";

function getInitials(name: string | null, email: string | null) {
  const s = name || email || "?";
  return s.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

function getStatusColor(status: PresenceStatus, isOnline: boolean): string {
  if (!isOnline) return "bg-muted-foreground/40";
  switch (status) {
    case "in-call": return "bg-yellow-500";
    case "away": return "bg-orange-500";
    case "dnd": return "bg-destructive";
    default: return "bg-green-500";
  }
}

function getStatusLabel(status: PresenceStatus, isOnline: boolean): string {
  if (!isOnline) return "Offline";
  switch (status) {
    case "in-call": return "In Call";
    case "away": return "Away";
    case "dnd": return "Do Not Disturb";
    default: return "Online";
  }
}

interface ChatGroup {
  id: string;
  name: string;
  workspace_id: string;
  created_by: string;
}

interface GroupMeta {
  memberCount: number;
  lastMessage: string | null;
}

interface ChatSidebarProps {
  workspaceId: string | undefined;
  members: PresenceMember[];
  myStatus?: PresenceStatus;
  onStatusChange?: (status: PresenceStatus) => void;
  typingUserIds?: Set<string>;
  typingGroupMap?: Map<string, string[]>;
}

export default function ChatSidebar({ workspaceId, members, myStatus, onStatusChange, typingUserIds, typingGroupMap }: ChatSidebarProps) {
  const navigate = useNavigate();
  const { userId: activeUserId, groupId: activeGroupId } = useParams<{ userId?: string; groupId?: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [groupsOpen, setGroupsOpen] = useState(true);

  // DM unread counts
  const { data: unreadMap = {} } = useQuery({
    queryKey: ["chat-dm-unread", workspaceId],
    queryFn: async () => {
      if (!workspaceId || !user) return {};
      const { data } = await supabase.from("chat_messages").select("sender_id").eq("workspace_id", workspaceId).eq("recipient_id", user.id).is("group_id" as any, null).eq("is_read", false);
      const map: Record<string, number> = {};
      ((data as any[]) || []).forEach((m) => { map[m.sender_id] = (map[m.sender_id] || 0) + 1; });
      return map;
    },
    enabled: !!workspaceId && !!user,
    staleTime: 15_000,
  });

  // Groups
  const { data: groups = [] } = useQuery({
    queryKey: ["chat-groups", workspaceId],
    queryFn: async () => {
      if (!workspaceId || !user) return [];
      const { data } = await supabase.from("chat_groups").select("id, name, workspace_id, created_by").eq("workspace_id", workspaceId);
      return (data as any as ChatGroup[]) || [];
    },
    enabled: !!workspaceId && !!user,
    staleTime: 60_000,
  });

  // Group unread
  const { data: groupUnreadMap = {} } = useQuery({
    queryKey: ["chat-group-unread", workspaceId, groups.length],
    queryFn: async () => {
      if (!workspaceId || !user || groups.length === 0) return {};
      const { data } = await supabase.from("chat_messages" as any).select("group_id").eq("workspace_id", workspaceId).not("group_id", "is", null).neq("sender_id", user.id).eq("is_read", false);
      const map: Record<string, number> = {};
      ((data as any[]) || []).forEach((m) => { if (m.group_id) map[m.group_id] = (map[m.group_id] || 0) + 1; });
      return map;
    },
    enabled: !!workspaceId && !!user && groups.length > 0,
    staleTime: 15_000,
  });

  // Group meta
  const { data: groupMeta = {} } = useQuery({
    queryKey: ["chat-group-meta", workspaceId, groups.map((g) => g.id).join(",")],
    queryFn: async () => {
      if (!workspaceId || !user || groups.length === 0) return {};
      const groupIds = groups.map((g) => g.id);
      const meta: Record<string, GroupMeta> = {};
      const { data: memberRows } = await supabase.from("chat_group_members").select("group_id").in("group_id", groupIds);
      const countMap: Record<string, number> = {};
      ((memberRows as any[]) || []).forEach((r) => { countMap[r.group_id] = (countMap[r.group_id] || 0) + 1; });
      const { data: msgRows } = await supabase.from("chat_messages").select("group_id, message, created_at").in("group_id", groupIds as any).not("group_id", "is", null).order("created_at", { ascending: false }).limit(100);
      const lastMsgMap: Record<string, string> = {};
      ((msgRows as any[]) || []).forEach((m) => { if (m.group_id && !lastMsgMap[m.group_id]) lastMsgMap[m.group_id] = m.message || ""; });
      groupIds.forEach((id) => { meta[id] = { memberCount: countMap[id] || 0, lastMessage: lastMsgMap[id] || null }; });
      return meta;
    },
    enabled: !!workspaceId && !!user && groups.length > 0,
    staleTime: 60_000,
  });

  // Realtime invalidation
  useEffect(() => {
    if (!workspaceId || !user) return;
    const channel = supabase.channel(`chat-sidebar-${workspaceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages", filter: `workspace_id=eq.${workspaceId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["chat-dm-unread", workspaceId] });
        queryClient.invalidateQueries({ queryKey: ["chat-group-unread", workspaceId] });
        queryClient.invalidateQueries({ queryKey: ["chat-group-meta", workspaceId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_groups", filter: `workspace_id=eq.${workspaceId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["chat-groups", workspaceId] });
      })
      .subscribe();
    return () => { channel.unsubscribe(); };
  }, [workspaceId, user?.id, queryClient]);

  const filteredMembers = useMemo(() => {
    let list = members;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = members.filter((m) => (m.full_name || "").toLowerCase().includes(q) || (m.email || "").toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => ((unreadMap as Record<string, number>)[b.user_id] || 0) - ((unreadMap as Record<string, number>)[a.user_id] || 0));
  }, [members, searchQuery, unreadMap]);

  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groups;
    const q = searchQuery.toLowerCase();
    return groups.filter((g) => g.name.toLowerCase().includes(q));
  }, [groups, searchQuery]);

  const handleSelect = (m: PresenceMember) => navigate(`/chat/${m.user_id}`);
  const handleSelectGroup = (g: ChatGroup) => navigate(`/chat/group/${g.id}`);
  const handleGroupCreated = (groupId: string) => { navigate(`/chat/group/${groupId}`); queryClient.invalidateQueries({ queryKey: ["chat-groups", workspaceId] }); };

  return (
    <>
      <div className="flex flex-col h-full border-r border-border bg-sidebar">
        {/* Header */}
        <div className="border-b border-border flex items-center px-4 py-3 justify-between">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <MessageCircle className="h-4 w-4" /> Chat
          </h2>
          {myStatus && onStatusChange && (
            <Select value={myStatus} onValueChange={(v) => onStatusChange(v as PresenceStatus)} disabled={myStatus === "in-call"}>
              <SelectTrigger className={cn("w-[130px] h-7 text-[11px] border-none shadow-none px-2", myStatus === "in-call" && "opacity-80 cursor-not-allowed")}>
                {myStatus === "in-call" ? <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-yellow-500" /> In Call</span> : <SelectValue />}
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="available"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-green-500" /> Available</span></SelectItem>
                <SelectItem value="away"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-orange-500" /> Away</span></SelectItem>
                <SelectItem value="dnd"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-destructive" /> Do Not Disturb</span></SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Search */}
        <div className="px-3 pt-3 pb-1">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="h-8 pl-8 pr-8 text-xs" />
            {searchQuery && <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2"><X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" /></button>}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Groups */}
          <Collapsible open={groupsOpen} onOpenChange={setGroupsOpen}>
            <div className="px-4 pt-3 pb-1 flex items-center justify-between">
              <CollapsibleTrigger className="flex items-center gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors">
                <ChevronDown className={cn("h-3 w-3 transition-transform", !groupsOpen && "-rotate-90")} /> Groups
              </CollapsibleTrigger>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowCreateGroup(true)} title="New Group">
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
            <CollapsibleContent>
              {filteredGroups.length === 0 ? (
                <p className="text-xs text-muted-foreground px-4 pb-2">No groups yet</p>
              ) : filteredGroups.map((g) => {
                const meta = (groupMeta as Record<string, GroupMeta>)[g.id];
                return (
                  <button key={g.id} onClick={() => handleSelectGroup(g)} className={cn("flex w-full items-center gap-3 px-4 py-2.5 transition-colors text-left", activeGroupId === g.id ? "bg-primary/10 text-foreground" : "hover:bg-primary/10")}>
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Users className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{g.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {typingGroupMap?.has(g.id) && typingGroupMap.get(g.id)!.length > 0 ? (
                          <span className="italic text-primary">{typingGroupMap.get(g.id)![0]} is typing…</span>
                        ) : (
                          <>{meta ? `${meta.memberCount} member${meta.memberCount !== 1 ? "s" : ""}` : "…"}{meta?.lastMessage && ` · ${meta.lastMessage}`}</>
                        )}
                      </p>
                    </div>
                    {(groupUnreadMap as Record<string, number>)[g.id] > 0 && (
                      <Badge variant="destructive" className="h-5 min-w-[20px] rounded-full text-[10px] px-1.5">
                        {(groupUnreadMap as Record<string, number>)[g.id]}
                      </Badge>
                    )}
                  </button>
                );
              })}
            </CollapsibleContent>
          </Collapsible>

          {/* DMs */}
          <div className="px-4 pt-3 pb-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Direct Messages</p>
          </div>
          {filteredMembers.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground p-4">No team members.</div>
          ) : filteredMembers.map((m) => (
            <button key={m.user_id} onClick={() => handleSelect(m)} className={cn("flex w-full items-center gap-3 px-4 py-3 transition-colors text-left", activeUserId === m.user_id ? "bg-primary/10 text-foreground" : "hover:bg-primary/10")}>
              <div className="relative">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">{getInitials(m.full_name, m.email)}</AvatarFallback>
                </Avatar>
                <span className={cn("absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-sidebar", getStatusColor(m.status, m.is_online))} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className={cn("text-sm truncate", (unreadMap as Record<string, number>)[m.user_id] > 0 ? "font-bold" : "font-medium")}>{m.full_name || m.email || "Unknown"}</p>
                  {m.extension_number && <span className="text-[10px] font-semibold text-muted-foreground shrink-0">({m.extension_number})</span>}
                </div>
                <p className="text-xs text-muted-foreground">
                  {typingUserIds?.has(m.user_id) ? <span className="italic text-primary animate-pulse">typing…</span> : getStatusLabel(m.status, m.is_online)}
                </p>
              </div>
              {(unreadMap as Record<string, number>)[m.user_id] > 0 && (
                <Badge variant="destructive" className="h-5 min-w-[20px] rounded-full text-[10px] px-1.5">
                  {(unreadMap as Record<string, number>)[m.user_id]}
                </Badge>
              )}
            </button>
          ))}
        </div>
      </div>

      {workspaceId && <CreateGroupDialog open={showCreateGroup} onOpenChange={setShowCreateGroup} workspaceId={workspaceId} onCreated={handleGroupCreated} />}
    </>
  );
}
