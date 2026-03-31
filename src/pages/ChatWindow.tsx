import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { usePresenceContext } from "@/contexts/PresenceContext";
import { useVoicePhoneContext } from "@/contexts/VoicePhoneContext";
import { useChatMessages, ChatMessage } from "@/hooks/useChatMessages";
import { useTypingIndicator, useWorkspaceTypingPresence } from "@/hooks/useTypingIndicator";
import { supabase } from "@/lib/supabase";
import FramelessTitleBar from "@/components/FramelessTitleBar";
import ChatSidebar from "@/components/ChatSidebar";
import ChatLightbox from "@/components/ChatLightbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Send, MessageCircle, Phone, Paperclip, X, Reply, Trash2, Pencil, CornerUpRight, RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { isImageFile } from "@/lib/image-utils";
import { toast } from "sonner";

function getInitials(name: string | null, email: string | null) {
  const s = name || email || "?";
  return s.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

export default function ChatWindow() {
  const { userId, groupId } = useParams<{ userId?: string; groupId?: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const { members, myStatus, updateStatus } = usePresenceContext();
  const phone = useVoicePhoneContext();
  const workspaceId = currentWorkspace?.id;
  const isGroup = !!groupId;

  // Typing
  const typingChannelKey = useMemo(() => {
    if (isGroup && groupId) return `group-${groupId}`;
    if (userId && user?.id) return `dm-${[user.id, userId].sort().join("-")}`;
    return undefined;
  }, [isGroup, groupId, userId, user?.id]);
  const { typingUsers, broadcastTyping, stopTyping } = useTypingIndicator(workspaceId, typingChannelKey, user?.id, user?.user_metadata?.full_name || null);
  const { typingMap: wsTypingMap } = useWorkspaceTypingPresence(workspaceId, user?.id, user?.user_metadata?.full_name || null);

  // Typing indicators for sidebar
  const typingUserIds = useMemo(() => {
    const set = new Set<string>();
    wsTypingMap.forEach((entry, uid) => {
      if (entry.target === `dm-${[user?.id, uid].sort().join("-")}`) set.add(uid);
    });
    return set;
  }, [wsTypingMap, user?.id]);

  const typingGroupMap = useMemo(() => {
    const map = new Map<string, string[]>();
    wsTypingMap.forEach((entry) => {
      if (entry.target.startsWith("group-")) {
        const gid = entry.target.replace("group-", "");
        const existing = map.get(gid) || [];
        existing.push(entry.fullName);
        map.set(gid, existing);
      }
    });
    return map;
  }, [wsTypingMap]);

  const { messages, loading, loadingMore, hasMore, loadMore, sendMessage, editMessage, deleteMessage, restoreMessage, forwardMessage } = useChatMessages(workspaceId, userId ?? null, groupId ?? null);
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Group info
  const [groupInfo, setGroupInfo] = useState<{ name: string; memberCount: number } | null>(null);
  const [senderNames, setSenderNames] = useState<Record<string, string>>({});

  // Reply / edit state
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  // Lightbox
  const [lightboxImages, setLightboxImages] = useState<{ url: string; name?: string }[] | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Selected member
  const selectedMember = !isGroup && userId ? members.find((m) => m.user_id === userId) ?? null : null;

  // Recipient extension for call
  const [recipientExt, setRecipientExt] = useState<string | null>(null);
  useEffect(() => {
    if (!userId || !workspaceId || isGroup) { setRecipientExt(null); return; }
    supabase.from("extensions").select("extension_number").eq("user_id", userId).eq("workspace_id", workspaceId).maybeSingle().then(({ data }) => setRecipientExt(data?.extension_number ?? null));
  }, [userId, workspaceId, isGroup]);

  // Group info
  useEffect(() => {
    if (!groupId || !workspaceId) { setGroupInfo(null); return; }
    (async () => {
      const { data: group } = await supabase.from("chat_groups").select("name").eq("id", groupId).single();
      const { count } = await supabase.from("chat_group_members").select("*", { count: "exact", head: true }).eq("group_id", groupId);
      setGroupInfo({ name: (group as any)?.name || "Group", memberCount: count || 0 });
    })();
  }, [groupId, workspaceId]);

  // Sender names for group
  useEffect(() => {
    if (!isGroup || messages.length === 0) return;
    const unknownIds = [...new Set(messages.map((m) => m.sender_id))].filter((id) => !senderNames[id] && id !== user?.id);
    if (unknownIds.length === 0) return;
    (async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name, email").in("user_id", unknownIds);
      const map: Record<string, string> = { ...senderNames };
      (data || []).forEach((p: any) => { map[p.user_id] = p.full_name || p.email || "Unknown"; });
      setSenderNames(map);
    })();
  }, [isGroup, messages.length]);

  // Auto scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  const handleSend = useCallback(async () => {
    if (!text.trim() && !uploading) return;
    stopTyping();
    await sendMessage(text, undefined, replyTo?.id);
    setText("");
    setReplyTo(null);
  }, [text, sendMessage, replyTo, stopTyping, uploading]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !workspaceId) return;
    setUploading(true);
    try {
      const path = `${workspaceId}/${Date.now()}_${file.name}`;
      const { error } = await supabase.storage.from("chat-files").upload(path, file);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("chat-files").getPublicUrl(path);
      await sendMessage("", { url: urlData.publicUrl, name: file.name });
    } catch (err) {
      toast.error("File upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleStartEdit = (msg: ChatMessage) => {
    setEditingMsgId(msg.id);
    setEditText(msg.message);
  };

  const handleSaveEdit = async () => {
    if (editingMsgId && editText.trim()) {
      await editMessage(editingMsgId, editText.trim());
      setEditingMsgId(null);
      setEditText("");
    }
  };

  // Filter visible messages
  const visibleMessages = useMemo(() => {
    return messages.filter((msg) => {
      if (!msg.deleted_at) return true;
      if (msg.sender_id === user?.id) {
        const deletedAt = new Date(msg.deleted_at).getTime();
        return Date.now() - deletedAt < 7 * 24 * 60 * 60 * 1000;
      }
      return false;
    });
  }, [messages, user?.id]);

  // Reply map
  const replyMap = useMemo(() => {
    const map = new Map<string, ChatMessage>();
    messages.forEach((m) => map.set(m.id, m));
    return map;
  }, [messages]);

  // Conversation header info
  const headerName = isGroup ? groupInfo?.name || "Group" : selectedMember?.full_name || selectedMember?.email || "Unknown";
  const headerSub = isGroup ? `${groupInfo?.memberCount || 0} members` : (selectedMember ? (selectedMember.is_online ? "Online" : "Offline") : "");
  const hasConversation = !!userId || !!groupId;

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <FramelessTitleBar title="Centelos Chat" showMinimize showClose />

      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <div className="w-64 shrink-0">
          <ChatSidebar
            workspaceId={workspaceId}
            members={members}
            myStatus={myStatus}
            onStatusChange={updateStatus}
            typingUserIds={typingUserIds}
            typingGroupMap={typingGroupMap}
          />
        </div>

        {/* Conversation */}
        <div className="flex-1 flex flex-col min-w-0">
          {hasConversation ? (
            <>
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs">{getInitials(headerName, null)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-semibold">{headerName}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {typingUsers.length > 0 ? (
                        <span className="italic text-primary animate-pulse">{typingUsers.map((t) => t.fullName).join(", ")} typing…</span>
                      ) : headerSub}
                    </p>
                  </div>
                </div>
                {!isGroup && recipientExt && (
                  <Button variant="ghost" size="icon" className="h-8 w-8" title="Call" onClick={() => phone.makeCall(recipientExt)}>
                    <Phone className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {/* Load more */}
              {hasMore && (
                <div className="text-center py-2">
                  <Button variant="ghost" size="sm" onClick={loadMore} disabled={loadingMore}>
                    {loadingMore ? "Loading…" : "Load older messages"}
                  </Button>
                </div>
              )}

              {/* Messages */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2">
                {loading && <p className="text-center text-muted-foreground text-sm animate-pulse">Loading…</p>}
                {visibleMessages.map((msg) => {
                  const isMine = msg.sender_id === user?.id;
                  const isDeleted = !!msg.deleted_at;
                  const isEdited = !!msg.edited_at;
                  const replyOriginal = msg.reply_to_id ? replyMap.get(msg.reply_to_id) : null;
                  const senderName = isGroup && !isMine ? senderNames[msg.sender_id] || "Unknown" : null;
                  const isImage = msg.file_url && msg.file_name && isImageFile(msg.file_name);

                  return (
                    <div key={msg.id} className={cn("flex group/msg", isMine ? "justify-end" : "justify-start")}>
                      <div className={cn("max-w-[75%] relative", isDeleted && "opacity-50")}>
                        {/* Reply preview */}
                        {replyOriginal && (
                          <div className="text-[10px] text-muted-foreground border-l-2 border-primary/30 pl-2 mb-1 truncate">
                            ↩ {replyOriginal.message}
                          </div>
                        )}
                        {senderName && <p className="text-[10px] font-medium text-primary mb-0.5">{senderName}</p>}

                        {editingMsgId === msg.id ? (
                          <div className="flex gap-1">
                            <Input value={editText} onChange={(e) => setEditText(e.target.value)} className="h-8 text-sm" onKeyDown={(e) => { if (e.key === "Enter") handleSaveEdit(); if (e.key === "Escape") { setEditingMsgId(null); setEditText(""); } }} autoFocus />
                            <Button size="sm" onClick={handleSaveEdit}>Save</Button>
                          </div>
                        ) : (
                          <div className={cn("rounded-2xl px-3.5 py-2 text-sm", isMine ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm")}>
                            {isDeleted ? (
                              <p className="italic text-xs">Message deleted</p>
                            ) : (
                              <>
                                {isImage ? (
                                  <img src={msg.file_url!} alt={msg.file_name!} className="max-w-full max-h-48 rounded-lg cursor-pointer" onClick={() => { setLightboxImages([{ url: msg.file_url!, name: msg.file_name! }]); setLightboxIndex(0); }} />
                                ) : msg.file_url ? (
                                  <a href={msg.file_url} target="_blank" rel="noopener noreferrer" className="underline text-xs">{msg.file_name || "File"}</a>
                                ) : null}
                                {msg.message && <p>{msg.message}</p>}
                              </>
                            )}
                            <div className="flex items-center gap-1 mt-0.5">
                              <p className={cn("text-[10px]", isMine ? "text-primary-foreground/60" : "text-muted-foreground")}>
                                {format(new Date(msg.created_at), "HH:mm")}
                              </p>
                              {isEdited && <span className={cn("text-[9px]", isMine ? "text-primary-foreground/40" : "text-muted-foreground/60")}>(edited)</span>}
                              {msg.forwarded_from_id && <CornerUpRight className="h-2.5 w-2.5 inline opacity-50" />}
                            </div>
                          </div>
                        )}

                        {/* Action buttons */}
                        {!isDeleted && !editingMsgId && (
                          <div className={cn("absolute top-0 flex gap-0.5 opacity-0 group-hover/msg:opacity-100 transition-opacity", isMine ? "right-full mr-1" : "left-full ml-1")}>
                            <button onClick={() => setReplyTo(msg)} className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted" title="Reply">
                              <Reply className="h-3 w-3" />
                            </button>
                            {isMine && (
                              <>
                                <button onClick={() => handleStartEdit(msg)} className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted" title="Edit">
                                  <Pencil className="h-3 w-3" />
                                </button>
                                <button onClick={() => deleteMessage(msg.id)} className="h-6 w-6 rounded flex items-center justify-center hover:bg-destructive/10 text-destructive" title="Delete">
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </>
                            )}
                          </div>
                        )}
                        {isDeleted && isMine && (
                          <button onClick={() => restoreMessage(msg.id)} className="text-[10px] text-primary hover:underline mt-0.5">
                            <RotateCcw className="h-3 w-3 inline mr-0.5" /> Undo
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Reply preview */}
              {replyTo && (
                <div className="px-4 py-2 border-t border-border bg-muted/30 flex items-center gap-2">
                  <Reply className="h-3.5 w-3.5 text-primary shrink-0" />
                  <p className="text-xs text-muted-foreground truncate flex-1">{replyTo.message}</p>
                  <button onClick={() => setReplyTo(null)}><X className="h-3.5 w-3.5" /></button>
                </div>
              )}

              {/* Input */}
              <div className="border-t border-border p-3">
                <div className="flex items-center gap-2">
                  <input type="file" ref={fileInputRef} className="hidden" onChange={handleFile} />
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                    <Paperclip className="h-4 w-4" />
                  </Button>
                  <Input
                    value={text}
                    onChange={(e) => { setText(e.target.value); broadcastTyping(); }}
                    placeholder="Type a message…"
                    className="h-9 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
                    }}
                  />
                  <Button size="icon" className="h-8 w-8 shrink-0" onClick={handleSend} disabled={!text.trim() && !uploading}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Select a conversation</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {lightboxImages && (
        <ChatLightbox images={lightboxImages} initialIndex={lightboxIndex} onClose={() => { setLightboxImages(null); setLightboxIndex(0); }} />
      )}
    </div>
  );
}
