import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Send, MessageCircle, Phone, Paperclip, FileIcon, Download, ExternalLink,
  Users, X, Trash2, RotateCcw, Pencil, Reply, Forward, Copy, Search,
  MoreVertical, Loader2, ChevronUp, ChevronDown, Ban, Smile, Plus,
  Check, CheckCheck, LogOut,
} from "lucide-react";
import { useTypingIndicator, useWorkspaceTypingPresence } from "@/hooks/useTypingIndicator";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { usePresenceContext, PresenceStatus } from "@/contexts/PresenceContext";
import { useVoicePhoneContext } from "@/contexts/VoicePhoneContext";
import { useChatMessages, ChatMessage } from "@/hooks/useChatMessages";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { format, isToday, isYesterday, differenceInCalendarDays } from "date-fns";
import { toast } from "sonner";
import ChatLightbox from "@/components/ChatLightbox";
import ChatSidebar from "@/components/ChatSidebar";
import FramelessTitleBar from "@/components/FramelessTitleBar";
import { processImageFile, isImageFile } from "@/lib/image-utils";
import { computeFileHash } from "@/lib/file-hash";
import { replaceEmoticons } from "@/lib/emoticons";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import data from "@emoji-mart/data";
import Picker from "@emoji-mart/react";

/* ─── Helpers ─── */

function getInitials(name: string | null, email: string | null) {
  const s = name || email || "?";
  return s.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;

function getDateLabel(date: Date): string {
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  const diff = differenceInCalendarDays(new Date(), date);
  if (diff < 7) return format(date, "EEEE");
  return format(date, "EEE, d MMM");
}

function isImageUrl(url: string): boolean {
  return /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?.*)?$/i.test(url);
}

function renderMessageContent(text: string, isMine: boolean, highlightTerm?: string) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const regex = new RegExp(URL_REGEX.source, "g");

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const url = match[0];
    parts.push(
      <a key={match.index} href={url} target="_blank" rel="noopener noreferrer"
        className={cn("underline break-all", isMine ? "text-primary-foreground/90 hover:text-primary-foreground" : "text-primary hover:text-primary/80")}>
        {url.length > 60 ? url.slice(0, 57) + "…" : url}
        <ExternalLink className="inline h-3 w-3 ml-0.5 -mt-0.5" />
      </a>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));

  if (highlightTerm?.trim()) {
    const ht = highlightTerm.trim().toLowerCase();
    return parts.map((part, idx) => {
      if (typeof part !== "string") return part;
      const segments: React.ReactNode[] = [];
      let remaining = part;
      let segIdx = 0;
      while (remaining.length > 0) {
        const li = remaining.toLowerCase().indexOf(ht);
        if (li === -1) { segments.push(remaining); break; }
        if (li > 0) segments.push(remaining.slice(0, li));
        segments.push(<mark key={`hl-${idx}-${segIdx}`} className="bg-yellow-300/80 text-foreground rounded-sm px-0.5">{remaining.slice(li, li + ht.length)}</mark>);
        remaining = remaining.slice(li + ht.length);
        segIdx++;
      }
      return <span key={idx}>{segments}</span>;
    });
  }

  return parts.length > 0 ? parts : text;
}

interface GroupMemberProfile {
  user_id: string;
  full_name: string | null;
  email: string | null;
}

interface MessageGroup {
  type: "single" | "image-cluster";
  messages: ChatMessage[];
  senderId: string;
}

function groupMessages(messages: ChatMessage[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  let i = 0;
  while (i < messages.length) {
    const msg = messages[i];
    const isImage = msg.file_url && isImageUrl(msg.file_name || msg.file_url);
    if (isImage && !msg.deleted_at) {
      const cluster: ChatMessage[] = [msg];
      let j = i + 1;
      while (j < messages.length) {
        const next = messages[j];
        if (next.sender_id === msg.sender_id && !next.deleted_at && next.file_url && isImageUrl(next.file_name || next.file_url) && (!next.message || next.message === next.file_name)) {
          cluster.push(next); j++;
        } else break;
      }
      if (cluster.length >= 2) { groups.push({ type: "image-cluster", messages: cluster, senderId: msg.sender_id }); i = j; }
      else { groups.push({ type: "single", messages: [msg], senderId: msg.sender_id }); i++; }
    } else {
      groups.push({ type: "single", messages: [msg], senderId: msg.sender_id }); i++;
    }
  }
  return groups;
}

const MAX_VISIBLE_THUMBS = 3;
const QUICK_REACTIONS = [
  { emoji: "👍", label: "Like" },
  { emoji: "❤️", label: "Love" },
  { emoji: "😂", label: "Laugh" },
  { emoji: "😱", label: "Scared" },
];

export default function ChatWindow() {
  const { userId, groupId } = useParams<{ userId?: string; groupId?: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const phone = useVoicePhoneContext();
  const workspaceId = currentWorkspace?.id;
  const { members, myStatus, updateStatus } = usePresenceContext();
  const queryClient = useQueryClient();
  const isGroup = !!groupId;

  // Typing indicator
  const typingChannelKey = useMemo(() => {
    if (isGroup && groupId) return `group-${groupId}`;
    if (userId && user?.id) return `dm-${[user.id, userId].sort().join("-")}`;
    return undefined;
  }, [isGroup, groupId, userId, user?.id]);
  const { typingUsers, broadcastTyping, stopTyping } = useTypingIndicator(workspaceId, typingChannelKey, user?.id, user?.user_metadata?.full_name || null);
  const { typingMap: wsTypingMap, broadcastTyping: wsBroadcastTyping, stopTyping: wsStopTyping } = useWorkspaceTypingPresence(workspaceId, user?.id, user?.user_metadata?.full_name || null);

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

  const selectedUserIsTyping = useMemo(() => {
    if (isGroup || !userId || !user?.id) return false;
    const entry = wsTypingMap.get(userId);
    if (!entry) return false;
    return entry.target === `dm-${[user.id, userId].sort().join("-")}`;
  }, [wsTypingMap, isGroup, userId, user?.id]);

  const selectedMember = !isGroup && userId ? members.find((m) => m.user_id === userId) ?? null : null;
  const recipientIsDnd = selectedMember?.status === "dnd" && selectedMember?.is_online;
  const { messages, loading, loadingMore, hasMore, loadMore, sendMessage, editMessage, deleteMessage, restoreMessage, forwardMessage } = useChatMessages(workspaceId, userId ?? null, groupId ?? null);
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pastedFiles, setPastedFiles] = useState<File[]>([]);
  const [pastedPreviews, setPastedPreviews] = useState<string[]>([]);

  const [groupInfo, setGroupInfo] = useState<{ name: string; memberCount: number; created_by: string | null } | null>(null);
  const [senderNames, setSenderNames] = useState<Record<string, string>>({});

  const [showGroupMembers, setShowGroupMembers] = useState(false);
  const [groupMembers, setGroupMembers] = useState<GroupMemberProfile[]>([]);

  const [lightboxImages, setLightboxImages] = useState<{ url: string; name?: string }[] | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);

  const [forwardSelecting, setForwardSelecting] = useState(false);
  const [selectedForwardIds, setSelectedForwardIds] = useState<Set<string>>(new Set());
  const [showForwardDialog, setShowForwardDialog] = useState(false);

  const [showUserProfile, setShowUserProfile] = useState(false);
  const [showAddMemberDialog, setShowAddMemberDialog] = useState(false);
  const [deleteGroupConfirm, setDeleteGroupConfirm] = useState(false);
  const [leaveGroupConfirm, setLeaveGroupConfirm] = useState(false);
  const [sharedMedia, setSharedMedia] = useState<{ images: ChatMessage[]; files: ChatMessage[] }>({ images: [], files: [] });

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [emojiPickerMsgId, setEmojiPickerMsgId] = useState<string | null>(null);

  const openLightbox = useCallback((images: { url: string; name?: string }[], index: number) => {
    setLightboxImages(images); setLightboxIndex(index);
  }, []);
  const closeLightbox = useCallback(() => { setLightboxImages(null); setLightboxIndex(0); }, []);

  const visibleMessages = useMemo(() => {
    return messages.filter((msg: any) => {
      if (!msg.deleted_at) return true;
      if (msg.sender_id === user?.id) {
        const deletedAt = new Date(msg.deleted_at).getTime();
        return Date.now() - deletedAt < 7 * 24 * 60 * 60 * 1000;
      }
      return false;
    }) as ChatMessage[];
  }, [messages, user?.id]);

  const replyMap = useMemo(() => {
    const map = new Map<string, ChatMessage>();
    messages.forEach((m) => map.set(m.id, m));
    return map;
  }, [messages]);

  const messageGroups = useMemo(() => groupMessages(visibleMessages), [visibleMessages]);

  // ─── Emoji Reactions ───
  const messageIds = useMemo(() => visibleMessages.map((m) => m.id), [visibleMessages]);

  const { data: reactionsData = [], refetch: refetchReactions } = useQuery({
    queryKey: ["chat-reactions", workspaceId, messageIds.join(",")],
    queryFn: async () => {
      if (!workspaceId || messageIds.length === 0) return [];
      const { data } = await supabase.from("chat_message_reactions" as any).select("*").in("message_id", messageIds);
      return (data || []) as unknown as { id: string; message_id: string; user_id: string; emoji: string }[];
    },
    enabled: !!workspaceId && messageIds.length > 0,
    staleTime: 30_000,
  });

  const reactionsByMessage = useMemo(() => {
    const map: Record<string, { emoji: string; count: number; userIds: string[] }[]> = {};
    for (const r of reactionsData) {
      if (!map[r.message_id]) map[r.message_id] = [];
      const existing = map[r.message_id].find((e) => e.emoji === r.emoji);
      if (existing) { existing.count++; existing.userIds.push(r.user_id); }
      else map[r.message_id].push({ emoji: r.emoji, count: 1, userIds: [r.user_id] });
    }
    return map;
  }, [reactionsData]);

  useEffect(() => {
    if (!workspaceId) return;
    const channel = supabase.channel(`reactions-${workspaceId}`).on("postgres_changes", { event: "*", schema: "public", table: "chat_message_reactions" }, () => { refetchReactions(); }).subscribe();
    return () => { channel.unsubscribe(); };
  }, [workspaceId, refetchReactions]);

  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!user) return;
    const existing = reactionsData.find((r) => r.message_id === messageId && r.user_id === user.id && r.emoji === emoji);
    if (existing) await supabase.from("chat_message_reactions" as any).delete().eq("id", existing.id);
    else await supabase.from("chat_message_reactions" as any).insert({ message_id: messageId, user_id: user.id, emoji });
    refetchReactions();
  }, [user?.id, reactionsData, refetchReactions]);

  // ─── Data loading effects ───

  useEffect(() => {
    if (!groupId || !workspaceId) { setGroupInfo(null); return; }
    (async () => {
      const { data: group } = await supabase.from("chat_groups").select("name, created_by").eq("id", groupId).single();
      const { count } = await supabase.from("chat_group_members").select("*", { count: "exact", head: true }).eq("group_id", groupId);
      setGroupInfo({ name: (group as any)?.name || "Group", memberCount: count || 0, created_by: (group as any)?.created_by || null });
    })();
  }, [groupId, workspaceId]);

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

  useEffect(() => {
    if (!showGroupMembers || !groupId) return;
    (async () => {
      const { data: memberRows } = await supabase.from("chat_group_members").select("user_id").eq("group_id", groupId);
      if (!memberRows || memberRows.length === 0) { setGroupMembers([]); return; }
      const userIds = memberRows.map((r) => r.user_id);
      const { data: profiles } = await supabase.from("profiles").select("user_id, full_name, email").in("user_id", userIds);
      setGroupMembers((profiles || []) as GroupMemberProfile[]);
    })();
  }, [showGroupMembers, groupId]);

  const [recipientExt, setRecipientExt] = useState<string | null>(null);
  useEffect(() => {
    if (!userId || !workspaceId || isGroup) { setRecipientExt(null); return; }
    supabase.from("extensions").select("extension_number").eq("user_id", userId).eq("workspace_id", workspaceId).maybeSingle().then(({ data }) => setRecipientExt(data?.extension_number ?? null));
  }, [userId, workspaceId, isGroup]);

  useEffect(() => {
    if (!showUserProfile || !userId || !workspaceId || !user) return;
    (async () => {
      const { data } = await supabase.from("chat_messages").select("*").eq("workspace_id", workspaceId).is("group_id", null).not("file_url", "is", null).is("deleted_at", null)
        .or(`and(sender_id.eq.${user.id},recipient_id.eq.${userId}),and(sender_id.eq.${userId},recipient_id.eq.${user.id})`)
        .order("created_at", { ascending: false }).limit(100);
      const msgs = (data as any as ChatMessage[]) || [];
      const images = msgs.filter((m) => m.file_url && isImageUrl(m.file_name || m.file_url!));
      const files = msgs.filter((m) => m.file_url && !isImageUrl(m.file_name || m.file_url!));
      setSharedMedia({ images, files });
    })();
  }, [showUserProfile, userId, workspaceId, user?.id]);

  // ─── In-chat search ───
  useEffect(() => {
    if (!searchOpen || !searchQuery.trim() || !workspaceId || !user) {
      setSearchResults([]); setCurrentMatchIndex(0); setSearchLoading(false); return;
    }
    setSearchLoading(true);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(async () => {
      let query = supabase.from("chat_messages").select("id").eq("workspace_id", workspaceId).is("deleted_at", null).ilike("message", `%${searchQuery.trim()}%`).order("created_at", { ascending: true }).limit(200);
      if (isGroup) query = query.eq("group_id", groupId!);
      else query = query.is("group_id", null).or(`and(sender_id.eq.${user.id},recipient_id.eq.${userId}),and(sender_id.eq.${userId},recipient_id.eq.${user.id})`);
      const { data } = await query;
      const ids = (data || []).map((r: any) => r.id);
      setSearchResults(ids);
      setCurrentMatchIndex(ids.length > 0 ? ids.length - 1 : 0);
      setSearchLoading(false);
      if (ids.length > 0) {
        requestAnimationFrame(() => {
          const el = document.getElementById(`msg-${ids[ids.length - 1]}`);
          el?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
      }
    }, 300);
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  }, [searchQuery, searchOpen, workspaceId, userId, groupId, user?.id, isGroup]);

  const navigateSearch = (direction: "up" | "down") => {
    if (searchResults.length === 0) return;
    let next = direction === "up" ? currentMatchIndex - 1 : currentMatchIndex + 1;
    if (next < 0) next = searchResults.length - 1;
    if (next >= searchResults.length) next = 0;
    setCurrentMatchIndex(next);
    const el = document.getElementById(`msg-${searchResults[next]}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // ─── Scroll ───
  const prevMsgCountRef = useRef(0);
  useEffect(() => { prevMsgCountRef.current = 0; }, [userId, groupId]);
  useEffect(() => {
    if (userId || groupId) setTimeout(() => chatInputRef.current?.focus(), 100);
  }, [userId, groupId]);

  useEffect(() => {
    const isNewMessage = messages.length > prevMsgCountRef.current && prevMsgCountRef.current > 0;
    const isInitialLoad = prevMsgCountRef.current === 0 && messages.length > 0;
    if (isNewMessage || isInitialLoad) {
      const el = scrollRef.current;
      if (el) {
        if (isInitialLoad) {
          const scrollToBottom = () => el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
          requestAnimationFrame(() => requestAnimationFrame(scrollToBottom));
          setTimeout(scrollToBottom, 80);
          setTimeout(scrollToBottom, 300);
        } else {
          el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
        }
      }
    }
    prevMsgCountRef.current = messages.length;
  }, [messages.length]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !hasMore || loadingMore) return;
    if (el.scrollTop < 80) {
      const prevHeight = el.scrollHeight;
      loadMore().then(() => {
        requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight - prevHeight; });
      });
    }
  }, [hasMore, loadingMore, loadMore]);

  // ─── Pasted files ───
  useEffect(() => { return () => { pastedPreviews.forEach((url) => URL.revokeObjectURL(url)); }; }, [pastedPreviews]);
  const clearAllPastedFiles = () => { pastedPreviews.forEach((url) => URL.revokeObjectURL(url)); setPastedFiles([]); setPastedPreviews([]); };
  const removePastedFile = (index: number) => {
    URL.revokeObjectURL(pastedPreviews[index]);
    setPastedFiles((prev) => prev.filter((_, i) => i !== index));
    setPastedPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  // ─── File upload with dedup ───
  const checkDuplicate = async (file: File): Promise<{ isDuplicate: boolean; existingUrl?: string; _hash?: string }> => {
    if (!workspaceId || !user) return { isDuplicate: false };
    try {
      const hash = await computeFileHash(file);
      const { data } = await supabase.from("chat_file_hashes" as any).select("storage_path").eq("user_id", user.id).eq("file_hash", hash).maybeSingle();
      if (data) {
        const { data: signed } = await supabase.storage.from("chat-files").createSignedUrl((data as any).storage_path, 60 * 60 * 24 * 365);
        return { isDuplicate: true, existingUrl: signed?.signedUrl };
      }
      return { isDuplicate: false, _hash: hash };
    } catch { return { isDuplicate: false }; }
  };

  const recordFileHash = async (file: File, storagePath: string, hash?: string) => {
    if (!workspaceId || !user) return;
    try {
      const fileHash = hash || await computeFileHash(file);
      await supabase.from("chat_file_hashes" as any).insert({ workspace_id: workspaceId, user_id: user.id, file_hash: fileHash, storage_path: storagePath, file_name: file.name });
    } catch { /* Non-critical */ }
  };

  const uploadFile = async (file: File): Promise<{ url: string; name: string } | null> => {
    const targetId = isGroup ? groupId : userId;
    if (!workspaceId || !targetId || !user) return null;
    if (file.size > 10 * 1024 * 1024) { toast.error("File size must be under 10MB"); return null; }
    const dupResult = await checkDuplicate(file);
    if (dupResult.isDuplicate && dupResult.existingUrl) { toast.info("Reusing previously uploaded file."); return { url: dupResult.existingUrl, name: file.name }; }
    const msgId = crypto.randomUUID();
    const path = `${workspaceId}/${msgId}/${file.name}`;
    const { error: uploadError } = await supabase.storage.from("chat-files").upload(path, file);
    if (uploadError) throw uploadError;
    await recordFileHash(file, path, dupResult._hash);
    const { data: signedData } = await supabase.storage.from("chat-files").createSignedUrl(path, 60 * 60 * 24 * 365);
    const { data: urlData } = supabase.storage.from("chat-files").getPublicUrl(path);
    return { url: signedData?.signedUrl || urlData.publicUrl, name: file.name };
  };

  // ─── Handlers ───
  const handleSend = async () => {
    const hasText = text.trim().length > 0;
    const hasFiles = pastedFiles.length > 0;
    if (!hasText && !hasFiles) return;
    const msg = replaceEmoticons(text);
    const replyId = replyTo?.id;
    setText(""); setReplyTo(null); setUploading(hasFiles);
    try {
      if (hasFiles) {
        for (let i = 0; i < pastedFiles.length; i++) {
          const result = await uploadFile(pastedFiles[i]);
          if (result) await sendMessage(i === 0 && hasText ? msg : "", { url: result.url, name: result.name }, i === 0 ? replyId : undefined);
        }
        clearAllPastedFiles();
      } else {
        await sendMessage(msg, undefined, replyId);
      }
    } catch (err: any) { console.error("Send error:", err); toast.error("Failed to send message"); }
    finally { setUploading(false); }
  };

  const handleCall = useCallback(() => {
    if (!recipientExt) return;
    phone.makeCall(recipientExt);
    window.electronAPI?.focusSoftphone();
  }, [recipientExt, phone]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    let file = e.target.files?.[0];
    const targetId = isGroup ? groupId : userId;
    if (!file || !workspaceId || !targetId || !user) return;
    setUploading(true);
    try {
      if (isImageFile(file)) file = await processImageFile(file);
      const result = await uploadFile(file);
      if (result) { await sendMessage(text.trim(), { url: result.url, name: result.name }); setText(""); }
    } catch (err: any) { toast.error(err?.message || "Failed to upload file"); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          try {
            const named = new File([file], `screenshot-${Date.now()}.png`, { type: file.type });
            const processed = await processImageFile(named);
            setPastedFiles((prev) => [...prev, processed]);
            setPastedPreviews((prev) => [...prev, URL.createObjectURL(processed)]);
          } catch (err: any) { toast.error(err?.message || "Failed to process image"); }
        }
        break;
      }
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmId) return;
    try { await deleteMessage(deleteConfirmId); toast.success("Message deleted."); } catch { toast.error("Failed to delete message"); }
    setDeleteConfirmId(null);
  };

  const handleRestore = async (messageId: string) => {
    try { await restoreMessage(messageId); toast.success("Message restored"); } catch { toast.error("Failed to restore message"); }
  };

  const handleEditSave = async () => {
    if (!editingMsgId || !editText.trim()) return;
    try { await editMessage(editingMsgId, editText.trim()); toast.success("Message edited"); } catch { toast.error("Failed to edit message"); }
    setEditingMsgId(null); setEditText("");
  };

  const handleCopy = (msg: ChatMessage) => { navigator.clipboard.writeText(msg.message); toast.success("Copied to clipboard"); };

  const startForwardSelect = (msgId: string) => { setForwardSelecting(true); setSelectedForwardIds(new Set([msgId])); };
  const toggleForwardSelect = (msgId: string) => { setSelectedForwardIds((prev) => { const next = new Set(prev); if (next.has(msgId)) next.delete(msgId); else next.add(msgId); return next; }); };
  const cancelForwardSelect = () => { setForwardSelecting(false); setSelectedForwardIds(new Set()); };

  const handleForwardSelected = async (targetUserId: string) => {
    if (selectedForwardIds.size === 0) return;
    try {
      const ordered = visibleMessages.filter((m) => selectedForwardIds.has(m.id));
      for (const msg of ordered) await forwardMessage(msg, targetUserId);
      toast.success(`Forwarded ${ordered.length} message${ordered.length > 1 ? "s" : ""}`);
    } catch { toast.error("Failed to forward messages"); }
    setShowForwardDialog(false); cancelForwardSelect();
  };

  // ─── Render helpers ───
  const renderReplyQuote = (msg: ChatMessage) => {
    if (!msg.reply_to_id) return null;
    const original = replyMap.get(msg.reply_to_id);
    if (!original) return null;
    const isMine = msg.sender_id === user?.id;
    return (
      <div className={cn("text-[10px] px-2 py-1 mb-1 rounded border-l-2 cursor-pointer", isMine ? "border-primary-foreground/40 bg-primary-foreground/10 text-primary-foreground/80" : "border-primary/40 bg-primary/5 text-muted-foreground")}
        onClick={() => { const el = document.getElementById(`msg-${original.id}`); el?.scrollIntoView({ behavior: "smooth", block: "center" }); el?.classList.add("ring-2", "ring-primary/50"); setTimeout(() => el?.classList.remove("ring-2", "ring-primary/50"), 1500); }}>
        <span className="font-semibold">{original.sender_id === user?.id ? "You" : senderNames[original.sender_id] || selectedMember?.full_name || ""}</span>
        <p className="truncate">{original.message || original.file_name || "Media"}</p>
      </div>
    );
  };

  const renderDeletedPlaceholder = (msg: ChatMessage) => {
    const isMine = msg.sender_id === user?.id;
    if (!isMine) return null;
    return (
      <div key={msg.id} className="flex justify-end">
        <div className="max-w-[75%] rounded-lg px-3 py-2 text-sm bg-muted/50 border border-dashed border-border">
          <p className="text-xs text-muted-foreground italic">This message was deleted. It will be permanently removed after 7 days.</p>
          <div className="flex items-center gap-2 mt-1">
            <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => handleRestore(msg.id)}><RotateCcw className="h-3 w-3 mr-1" /> Restore</Button>
            <span className="text-[10px] text-muted-foreground">{format(new Date(msg.created_at), "h:mm a")}</span>
          </div>
        </div>
      </div>
    );
  };

  const renderHoverActions = (msg: ChatMessage) => {
    if (msg.deleted_at) return null;
    const isMine = msg.sender_id === user?.id;
    const isTextOnly = !msg.file_url && msg.message;
    return (
      <div className={cn("absolute -top-1 -translate-y-full opacity-0 group-hover:opacity-100 transition-opacity z-10 flex items-center gap-0.5 rounded-md border border-border bg-background shadow-sm px-0.5 py-0.5", isMine ? "right-0" : "left-0")}>
        {QUICK_REACTIONS.map((r) => (
          <button key={r.emoji} onClick={() => toggleReaction(msg.id, r.emoji)} className="h-7 w-7 flex items-center justify-center rounded hover:bg-accent transition-colors text-sm" title={r.label}>{r.emoji}</button>
        ))}
        <Popover open={emojiPickerMsgId === msg.id} onOpenChange={(open) => setEmojiPickerMsgId(open ? msg.id : null)}>
          <PopoverTrigger asChild>
            <button className="h-7 w-7 flex items-center justify-center rounded hover:bg-accent transition-colors" title="More reactions"><Plus className="h-3.5 w-3.5 text-muted-foreground" /></button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 border-0 shadow-lg" align={isMine ? "end" : "start"} side="top" sideOffset={8}>
            <Picker data={data} onEmojiSelect={(emoji: any) => { toggleReaction(msg.id, emoji.native); setEmojiPickerMsgId(null); }} theme="auto" previewPosition="none" skinTonePosition="none" maxFrequentRows={1} perLine={8} />
          </PopoverContent>
        </Popover>
        <div className="w-px h-5 bg-border mx-0.5" />
        <button onClick={() => setReplyTo(msg)} className="h-7 w-7 flex items-center justify-center rounded hover:bg-accent transition-colors" title="Reply"><Reply className="h-3.5 w-3.5 text-muted-foreground" /></button>
        <button onClick={() => startForwardSelect(msg.id)} className="h-7 w-7 flex items-center justify-center rounded hover:bg-accent transition-colors" title="Forward"><Forward className="h-3.5 w-3.5 text-muted-foreground" /></button>
        <Popover>
          <PopoverTrigger asChild>
            <button className="h-7 w-7 flex items-center justify-center rounded hover:bg-accent transition-colors" title="More"><MoreVertical className="h-3.5 w-3.5 text-muted-foreground" /></button>
          </PopoverTrigger>
          <PopoverContent className="w-40 p-1" align={isMine ? "end" : "start"} side="bottom">
            <button onClick={() => handleCopy(msg)} className="flex w-full items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-accent transition-colors"><Copy className="h-3.5 w-3.5" /> Copy text</button>
            {isMine && isTextOnly && (
              <button onClick={() => { setEditingMsgId(msg.id); setEditText(msg.message); }} className="flex w-full items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-accent transition-colors"><Pencil className="h-3.5 w-3.5" /> Edit</button>
            )}
            <button onClick={() => setDeleteConfirmId(msg.id)} className="flex w-full items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-accent transition-colors text-destructive"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
          </PopoverContent>
        </Popover>
      </div>
    );
  };

  const activeSearchId = searchResults.length > 0 ? searchResults[currentMatchIndex] : null;
  const searchHighlightTerm = searchOpen && searchQuery.trim() ? searchQuery.trim() : undefined;

  const renderSingleMessage = (msg: ChatMessage) => {
    if (msg.deleted_at) return renderDeletedPlaceholder(msg);
    const isMine = msg.sender_id === user?.id;
    const isImage = msg.file_url && isImageUrl(msg.file_name || msg.file_url);
    const isEditing = editingMsgId === msg.id;
    const isActiveMatch = msg.id === activeSearchId;

    return (
      <div id={`msg-${msg.id}`} key={msg.id} className={cn("flex transition-all group relative", isMine ? "justify-end" : "justify-start", isActiveMatch && "ring-2 ring-yellow-400 rounded-lg")}>
        {forwardSelecting && !msg.deleted_at && (<div className="flex items-center mr-2"><Checkbox checked={selectedForwardIds.has(msg.id)} onCheckedChange={() => toggleForwardSelect(msg.id)} /></div>)}
        {renderHoverActions(msg)}
        <div className={cn("max-w-[75%] rounded-lg px-3 py-2 text-sm", isMine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}>
          {isGroup && !isMine && <p className="text-[10px] font-semibold mb-0.5 opacity-70">{senderNames[msg.sender_id] || "…"}</p>}
          {renderReplyQuote(msg)}
          {msg.forwarded_from_id && <p className={cn("text-[10px] italic mb-1", isMine ? "text-primary-foreground/60" : "text-muted-foreground")}>↪ Forwarded</p>}
          {msg.file_url && (
            <div className="mb-1">
              {isImage ? (
                <button onClick={() => openLightbox([{ url: msg.file_url!, name: msg.file_name || undefined }], 0)} className="block cursor-pointer">
                  <img src={msg.file_url} alt={msg.file_name || "Image"} className="max-w-full max-h-48 rounded object-cover hover:opacity-90 transition-opacity" loading="lazy" />
                </button>
              ) : (
                <a href={msg.file_url} target="_blank" rel="noopener noreferrer" className={cn("flex items-center gap-2 p-2 rounded border", isMine ? "border-primary-foreground/20 hover:bg-primary-foreground/10" : "border-border hover:bg-accent")}>
                  <FileIcon className="h-5 w-5 shrink-0" /><span className="truncate text-xs flex-1">{msg.file_name || "File"}</span><Download className="h-4 w-4 shrink-0" />
                </a>
              )}
            </div>
          )}
          {isEditing ? (
            <div className="space-y-1">
              <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} className="min-h-[40px] text-sm bg-background text-foreground" autoFocus onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleEditSave(); } if (e.key === "Escape") setEditingMsgId(null); }} />
              <div className="flex gap-1.5">
                <Button size="sm" className="h-6 text-xs px-2" onClick={handleEditSave}>Save</Button>
                <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setEditingMsgId(null)}>Cancel</Button>
              </div>
            </div>
          ) : (
            msg.message && !(msg.file_url && msg.message === msg.file_name) && <p className="break-words whitespace-pre-wrap">{renderMessageContent(msg.message, isMine, searchHighlightTerm)}</p>
          )}
          <p className={cn("text-[10px] mt-1 flex items-center", isMine ? "text-primary-foreground/70" : "text-muted-foreground")}>
            {format(new Date(msg.created_at), "h:mm a")}
            {msg.edited_at && <span className="ml-1 italic">(edited)</span>}
            {isMine && !isGroup && (msg.is_read ? <CheckCheck className="h-3.5 w-3.5 ml-1 text-white drop-shadow-sm" /> : <Check className="h-3.5 w-3.5 ml-1 text-primary-foreground/50" />)}
          </p>
          {reactionsByMessage[msg.id] && reactionsByMessage[msg.id].length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5 -mb-0.5">
              {reactionsByMessage[msg.id].map((r) => (
                <button key={r.emoji} onClick={() => toggleReaction(msg.id, r.emoji)}
                  className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs border transition-colors", r.userIds.includes(user?.id || "") ? "bg-primary/15 border-primary/30 text-foreground" : "bg-muted/50 border-border text-muted-foreground hover:bg-muted")}>
                  <span>{r.emoji}</span><span className="text-[10px] font-medium">{r.count}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderImageCluster = (group: MessageGroup) => {
    const { messages: clusterMsgs, senderId } = group;
    const isMine = senderId === user?.id;
    const allImages = clusterMsgs.filter((m) => m.file_url).map((m) => ({ url: m.file_url!, name: m.file_name || undefined }));
    const visibleCount = Math.min(clusterMsgs.length, MAX_VISIBLE_THUMBS);
    const extraCount = clusterMsgs.length - MAX_VISIBLE_THUMBS;
    const firstMsg = clusterMsgs[0];
    const firstText = firstMsg.message && firstMsg.message !== firstMsg.file_name ? firstMsg.message : null;
    const lastMsg = clusterMsgs[clusterMsgs.length - 1];

    return (
      <div key={firstMsg.id} className={cn("flex group relative", isMine ? "justify-end" : "justify-start")}>
        {renderHoverActions(firstMsg)}
        <div className={cn("max-w-[75%] rounded-lg px-3 py-2 text-sm", isMine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}>
          {isGroup && !isMine && <p className="text-[10px] font-semibold mb-0.5 opacity-70">{senderNames[senderId] || "…"}</p>}
          <div className={cn("grid gap-1 mb-1", visibleCount === 1 ? "grid-cols-1" : visibleCount === 2 ? "grid-cols-2" : "grid-cols-3")}>
            {clusterMsgs.slice(0, visibleCount).map((msg, idx) => (
              <button key={msg.id} className="relative block overflow-hidden rounded cursor-pointer" onClick={() => openLightbox(allImages, idx)}>
                <img src={msg.file_url!} alt={msg.file_name || "Image"} className="w-full h-24 object-cover hover:opacity-90 transition-opacity" loading="lazy" />
                {idx === visibleCount - 1 && extraCount > 0 && (<div className="absolute inset-0 bg-black/50 flex items-center justify-center"><span className="text-white text-lg font-semibold">+{extraCount}</span></div>)}
              </button>
            ))}
          </div>
          {firstText && <p className="break-words whitespace-pre-wrap">{renderMessageContent(firstText, isMine, searchHighlightTerm)}</p>}
          <p className={cn("text-[10px] mt-1", isMine ? "text-primary-foreground/70" : "text-muted-foreground")}>{format(new Date(lastMsg.created_at), "h:mm a")}</p>
        </div>
      </div>
    );
  };

  const statusIcon = (status: PresenceStatus, online: boolean) => {
    if (!online) return "bg-muted-foreground/40";
    switch (status) { case "in-call": return "bg-yellow-500"; case "away": return "bg-orange-500"; case "dnd": return "bg-destructive"; default: return "bg-green-500"; }
  };

  const hasConversation = !!userId || !!groupId;

  const chatReady = !!user && !!currentWorkspace;

  // ─── Render ───
  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden relative">
      <FramelessTitleBar title="Centelos Chat" showMinimize showClose />

      {/* Full-window preloader */}
      {!chatReady && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm font-medium text-foreground">Loading chat...</p>
          <p className="text-xs text-muted-foreground mt-1">Setting up your workspace</p>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <div className="w-72 shrink-0">
          <ChatSidebar workspaceId={workspaceId} members={members} myStatus={myStatus} onStatusChange={updateStatus} typingUserIds={typingUserIds} typingGroupMap={typingGroupMap} />
        </div>

        {hasConversation ? (
          <div className="flex flex-col flex-1 overflow-hidden bg-background">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
              {isGroup ? (
                <>
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center"><Users className="h-4 w-4 text-primary" /></div>
                  <button className="min-w-0 flex-1 text-left hover:opacity-70 transition-opacity" onClick={() => setShowGroupMembers(true)}>
                    <p className="text-sm font-medium truncate">{groupInfo?.name || "Group"}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {typingUsers.length > 0 ? (
                        <span className="italic text-primary animate-pulse">
                          {typingUsers.length === 1 ? `${typingUsers[0].fullName} is typing…` : `${typingUsers[0].fullName} and ${typingUsers.length - 1} others are typing…`}
                        </span>
                      ) : <>{groupInfo?.memberCount || 0} members · tap for details</>}
                    </p>
                  </button>
                </>
              ) : selectedMember ? (
                <>
                  <div className="relative">
                    <Avatar className="h-9 w-9"><AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">{getInitials(selectedMember.full_name, selectedMember.email)}</AvatarFallback></Avatar>
                    <span className={cn("absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background", statusIcon(selectedMember.status, selectedMember.is_online))} />
                  </div>
                  <button className="min-w-0 flex-1 text-left hover:opacity-70 transition-opacity" onClick={() => setShowUserProfile(true)}>
                    <p className="text-sm font-medium truncate">{selectedMember.full_name || selectedMember.email}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {selectedUserIsTyping ? <span className="italic text-primary animate-pulse">typing…</span> : !selectedMember.is_online ? "Offline" : selectedMember.status === "in-call" ? "In Call" : selectedMember.status === "away" ? "Away" : selectedMember.status === "dnd" ? "Do Not Disturb" : "Online"}
                    </p>
                  </button>
                  <Button variant="ghost" size="icon" className="h-8 w-8"
                    disabled={!recipientExt || phone.phoneStatus !== "registered" || phone.callStatus !== "idle"}
                    onClick={handleCall} title={recipientExt ? `Call Ext ${recipientExt}` : "No extension assigned"}>
                    <Phone className="h-4 w-4" />
                  </Button>
                </>
              ) : <p className="text-sm text-muted-foreground">Loading member…</p>}

              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setSearchOpen(!searchOpen); setSearchQuery(""); setSearchResults([]); }} title="Search messages">
                <Search className="h-4 w-4" />
              </Button>
            </div>

            {/* Search bar */}
            {searchOpen && (
              <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/30">
                <div className="relative flex-1">
                  <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search in messages…" className="h-8 text-sm pr-8" autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter") navigateSearch("down"); if (e.key === "Escape") { setSearchOpen(false); setSearchQuery(""); setSearchResults([]); } }} />
                  {searchLoading && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap min-w-[60px] text-center">
                  {searchQuery.trim() ? searchResults.length > 0 ? `${currentMatchIndex + 1} of ${searchResults.length}` : searchLoading ? "…" : "0 matches" : ""}
                </span>
                <div className="flex items-center gap-0.5">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigateSearch("up")} disabled={searchResults.length === 0}><ChevronUp className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigateSearch("down")} disabled={searchResults.length === 0}><ChevronDown className="h-3.5 w-3.5" /></Button>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setSearchOpen(false); setSearchQuery(""); setSearchResults([]); }}><X className="h-3.5 w-3.5" /></Button>
              </div>
            )}

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-auto px-3 pt-2 pb-1" onScroll={handleScroll}>
              <div className="flex flex-col justify-end min-h-full space-y-2">
                {loadingMore && <p className="text-xs text-muted-foreground text-center py-2 animate-pulse">Loading older messages…</p>}
                {!loadingMore && hasMore && !loading && visibleMessages.length > 0 && <p className="text-xs text-muted-foreground/50 text-center py-1">Scroll up for older messages</p>}
                {loading && <p className="text-xs text-muted-foreground text-center">Loading…</p>}
                {!loading && visibleMessages.length === 0 && <p className="text-xs text-muted-foreground text-center mt-8">No messages yet. Say hi!</p>}
                {messageGroups.map((group, groupIdx) => {
                  const firstMsg = group.messages[0];
                  const msgDate = new Date(firstMsg.created_at);
                  let showDateSeparator = false;
                  if (groupIdx === 0) showDateSeparator = true;
                  else {
                    const prevGroup = messageGroups[groupIdx - 1];
                    const prevDate = new Date(prevGroup.messages[prevGroup.messages.length - 1].created_at);
                    showDateSeparator = msgDate.toDateString() !== prevDate.toDateString();
                  }
                  const dateSeparator = showDateSeparator ? (
                    <div className="flex items-center gap-2 my-2">
                      <div className="flex-1 h-px bg-border" />
                      <span className="text-[10px] text-muted-foreground font-medium">{getDateLabel(msgDate)}</span>
                      <div className="flex-1 h-px bg-border" />
                    </div>
                  ) : null;
                  const content = group.type === "image-cluster" ? renderImageCluster(group) : renderSingleMessage(group.messages[0]);
                  return <div key={firstMsg.id}>{dateSeparator}{content}</div>;
                })}
                {typingUsers.length > 0 && (
                  <div className="px-4 py-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="flex gap-0.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
                    </span>
                    <span className="italic">
                      {typingUsers.length === 1 ? `${typingUsers[0].fullName} is typing…` : `${typingUsers[0].fullName} and ${typingUsers.length - 1} others are typing…`}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Forward selection bar */}
            {forwardSelecting && (
              <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-muted/30">
                <span className="text-sm text-muted-foreground">{selectedForwardIds.size} message{selectedForwardIds.size !== 1 ? "s" : ""} selected</span>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={cancelForwardSelect}>Cancel</Button>
                  <Button size="sm" onClick={() => setShowForwardDialog(true)} disabled={selectedForwardIds.size === 0}><Forward className="h-3.5 w-3.5 mr-1.5" /> Forward {selectedForwardIds.size > 0 ? selectedForwardIds.size : ""}</Button>
                </div>
              </div>
            )}

            {/* Reply preview */}
            {replyTo && (
              <div className="px-4 py-2 border-t border-border bg-muted/30 flex items-center gap-2">
                <Reply className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold text-muted-foreground">Replying to {replyTo.sender_id === user?.id ? "yourself" : senderNames[replyTo.sender_id] || selectedMember?.full_name || ""}</p>
                  <p className="text-xs text-muted-foreground truncate">{replyTo.message || replyTo.file_name || "Media"}</p>
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setReplyTo(null)}><X className="h-3 w-3" /></Button>
              </div>
            )}

            {/* Composer */}
            <div className="p-4 border-t border-border">
              <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileSelect} />
              {recipientIsDnd && (
                <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground bg-destructive/10 rounded-md px-3 py-2">
                  <Ban className="h-3.5 w-3.5 text-destructive shrink-0" /><span>This user has Do Not Disturb enabled</span>
                </div>
              )}
              {uploading && (<div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /><span>Uploading…</span></div>)}
              {pastedPreviews.length > 0 && (
                <div className="mb-2 flex gap-2 overflow-x-auto">
                  {pastedPreviews.map((preview, i) => (
                    <div key={i} className="relative shrink-0 group/thumb">
                      <img src={preview} alt={pastedFiles[i]?.name || "Pasted"} className="h-16 w-16 object-cover rounded-lg border border-border" />
                      <button onClick={() => removePastedFile(i)} className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity shadow-sm"><X className="h-3 w-3" /></button>
                      <p className="text-[9px] text-muted-foreground text-center mt-0.5 max-w-[64px] truncate">{pastedFiles[i] ? `${(pastedFiles[i].size / 1024).toFixed(0)}KB` : ""}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => fileInputRef.current?.click()} disabled={uploading} title="Attach file"><Paperclip className="h-4 w-4" /></Button>
                <Popover>
                  <PopoverTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" title="Emoji"><Smile className="h-4 w-4" /></Button></PopoverTrigger>
                  <PopoverContent className="w-auto p-0 border-0 shadow-lg" side="top" align="start">
                    <Picker data={data} onEmojiSelect={(emoji: any) => setText((prev) => prev + emoji.native)} theme="auto" previewPosition="none" skinTonePosition="none" maxFrequentRows={1} perLine={8} />
                  </PopoverContent>
                </Popover>
                <Input ref={chatInputRef} value={text}
                  onChange={(e) => { setText(replaceEmoticons(e.target.value)); broadcastTyping(); if (typingChannelKey) wsBroadcastTyping(typingChannelKey); }}
                  placeholder={uploading ? "Uploading…" : "Type a message…"} className="flex-1 h-9" disabled={uploading} onPaste={handlePaste}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); stopTyping(); wsStopTyping(); handleSend(); } }} />
                <Button size="sm" onClick={() => { stopTyping(); wsStopTyping(); handleSend(); }} disabled={(!text.trim() && pastedFiles.length === 0) || uploading} className="h-8 px-3 shrink-0">
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-background">
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <MessageCircle className="h-10 w-10 opacity-30" />
              <p className="text-sm">Select a member or group to start chatting</p>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete message?</AlertDialogTitle><AlertDialogDescription>This message will be removed from the conversation.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Forward Dialog */}
      <Dialog open={showForwardDialog} onOpenChange={(open) => !open && setShowForwardDialog(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="text-sm">Forward {selectedForwardIds.size} message{selectedForwardIds.size !== 1 ? "s" : ""} to…</DialogTitle></DialogHeader>
          <div className="space-y-1 max-h-60 overflow-auto">
            {members.filter((m) => m.user_id !== user?.id).map((m) => (
              <button key={m.user_id} onClick={() => handleForwardSelected(m.user_id)} className="flex w-full items-center gap-3 px-3 py-2.5 rounded-md hover:bg-accent transition-colors text-left">
                <Avatar className="h-8 w-8"><AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">{getInitials(m.full_name, m.email)}</AvatarFallback></Avatar>
                <div className="min-w-0 flex-1"><p className="text-sm font-medium truncate">{m.full_name || m.email}</p><p className="text-[10px] text-muted-foreground">{m.is_online ? "Online" : "Offline"}</p></div>
              </button>
            ))}
            {members.filter((m) => m.user_id !== user?.id).length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No other members</p>}
          </div>
        </DialogContent>
      </Dialog>

      {/* User Profile Sheet */}
      {selectedMember && (
        <Sheet open={showUserProfile} onOpenChange={setShowUserProfile}>
          <SheetContent side="right" className="w-full sm:w-80 p-0 flex flex-col">
            <div className="flex flex-col items-center pt-8 pb-4 px-4 border-b border-border">
              <Avatar className="h-20 w-20 mb-3"><AvatarFallback className="text-2xl bg-primary/10 text-primary font-semibold">{getInitials(selectedMember.full_name, selectedMember.email)}</AvatarFallback></Avatar>
              <p className="text-base font-semibold">{selectedMember.full_name || selectedMember.email}</p>
              <p className="text-xs text-muted-foreground">{selectedMember.is_online ? "Online" : "Offline"}</p>
              <div className="flex gap-4 mt-4">
                <Button variant="ghost" size="sm" className="flex flex-col items-center gap-1 h-auto py-2" disabled={!recipientExt || phone.phoneStatus !== "registered" || phone.callStatus !== "idle"} onClick={handleCall}>
                  <Phone className="h-5 w-5" /><span className="text-[10px]">Call</span>
                </Button>
                <Button variant="ghost" size="sm" className="flex flex-col items-center gap-1 h-auto py-2" onClick={() => { setShowUserProfile(false); setSearchOpen(true); setSearchQuery(""); }}>
                  <Search className="h-5 w-5" /><span className="text-[10px]">Search</span>
                </Button>
              </div>
            </div>
            <Tabs defaultValue="media" className="flex-1 flex flex-col overflow-hidden">
              <TabsList className="mx-4 mt-2"><TabsTrigger value="media" className="flex-1 text-xs">Media</TabsTrigger><TabsTrigger value="files" className="flex-1 text-xs">Files</TabsTrigger></TabsList>
              <TabsContent value="media" className="flex-1 overflow-auto px-4 pb-4">
                {sharedMedia.images.length === 0 ? <p className="text-xs text-muted-foreground text-center mt-8">No shared images</p> : (
                  <div className="grid grid-cols-3 gap-1.5 mt-2">{sharedMedia.images.map((m) => (
                    <button key={m.id} className="aspect-square rounded overflow-hidden cursor-pointer" onClick={() => openLightbox([{ url: m.file_url!, name: m.file_name || undefined }], 0)}>
                      <img src={m.file_url!} alt={m.file_name || ""} className="w-full h-full object-cover hover:opacity-80 transition-opacity" loading="lazy" />
                    </button>
                  ))}</div>
                )}
              </TabsContent>
              <TabsContent value="files" className="flex-1 overflow-auto px-4 pb-4">
                {sharedMedia.files.length === 0 ? <p className="text-xs text-muted-foreground text-center mt-8">No shared files</p> : (
                  <div className="space-y-1.5 mt-2">{sharedMedia.files.map((m) => (
                    <a key={m.id} href={m.file_url!} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-2 rounded hover:bg-accent border border-border text-sm">
                      <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="truncate flex-1 text-xs">{m.file_name || "File"}</span><Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    </a>
                  ))}</div>
                )}
              </TabsContent>
            </Tabs>
          </SheetContent>
        </Sheet>
      )}

      {/* Group Members Sheet */}
      <Sheet open={showGroupMembers} onOpenChange={setShowGroupMembers}>
        <SheetContent side="right" className="w-80 p-0 flex flex-col">
          <SheetHeader className="px-4 py-3 border-b border-border">
            <SheetTitle className="text-sm font-semibold flex items-center gap-2"><Users className="h-4 w-4" /> {groupInfo?.name || "Group"} — Members</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-auto">
            {groupMembers.length === 0 ? <p className="text-xs text-muted-foreground p-4 text-center">No members found</p> : groupMembers.map((gm) => {
              const presence = members.find((m) => m.user_id === gm.user_id);
              const isMe = gm.user_id === user?.id;
              const isOnline = isMe ? true : (presence?.is_online ?? false);
              const isGroupAdmin = gm.user_id === groupInfo?.created_by;
              const iAmGroupAdmin = user?.id === groupInfo?.created_by;
              return (
                <div key={gm.user_id} className={cn("flex w-full items-center gap-3 px-4 py-3 transition-colors", isMe ? "opacity-60" : "hover:bg-accent/50")}>
                  <button disabled={isMe} onClick={() => { setShowGroupMembers(false); navigate(`/chat/${gm.user_id}`); }} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                    <div className="relative">
                      <Avatar className="h-8 w-8"><AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">{getInitials(gm.full_name, gm.email)}</AvatarFallback></Avatar>
                      <span className={cn("absolute bottom-0 right-0 h-2 w-2 rounded-full border-2 border-background", isOnline ? "bg-green-500" : "bg-muted-foreground/40")} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium truncate">{gm.full_name || gm.email || "Unknown"}{isMe ? " (you)" : ""}</p>
                        {isGroupAdmin && <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4">Admin</Badge>}
                      </div>
                      <p className="text-[10px] text-muted-foreground">{isOnline ? "Online" : "Offline"}</p>
                    </div>
                  </button>
                  {iAmGroupAdmin && !isMe && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive hover:text-destructive" title="Remove from group"
                      onClick={async () => {
                        const { error } = await supabase.from("chat_group_members").delete().eq("group_id", groupId!).eq("user_id", gm.user_id);
                        if (error) { toast.error("Failed to remove member"); return; }
                        setGroupMembers((prev) => prev.filter((m) => m.user_id !== gm.user_id));
                        setGroupInfo((prev) => prev ? { ...prev, memberCount: prev.memberCount - 1 } : prev);
                        toast.success("Member removed");
                      }}><X className="h-3.5 w-3.5" /></Button>
                  )}
                </div>
              );
            })}
          </div>
          {user?.id !== groupInfo?.created_by && (
            <div className="border-t border-border p-4">
              <Button variant="outline" size="sm" className="w-full text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive" onClick={() => setLeaveGroupConfirm(true)}>
                <LogOut className="h-3.5 w-3.5 mr-1.5" /> Leave Group
              </Button>
            </div>
          )}
          {user?.id === groupInfo?.created_by && (
            <div className="border-t border-border p-4 space-y-2">
              <Button variant="outline" size="sm" className="w-full" onClick={() => setShowAddMemberDialog(true)}><Users className="h-3.5 w-3.5 mr-1.5" /> Add Member</Button>
              <Button variant="destructive" size="sm" className="w-full" onClick={() => setDeleteGroupConfirm(true)}><Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete Group</Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Add Member Dialog */}
      <Dialog open={showAddMemberDialog} onOpenChange={setShowAddMemberDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="text-sm">Add member to {groupInfo?.name}</DialogTitle></DialogHeader>
          <div className="space-y-1 max-h-60 overflow-auto">
            {members.filter((m) => m.user_id !== user?.id && !groupMembers.some((gm) => gm.user_id === m.user_id)).map((m) => (
              <button key={m.user_id} onClick={async () => {
                const { error } = await supabase.from("chat_group_members").insert({ group_id: groupId!, user_id: m.user_id });
                if (error) { toast.error("Failed to add member"); return; }
                setGroupMembers((prev) => [...prev, { user_id: m.user_id, full_name: m.full_name, email: m.email }]);
                setGroupInfo((prev) => prev ? { ...prev, memberCount: prev.memberCount + 1 } : prev);
                toast.success(`${m.full_name || m.email} added`);
                setShowAddMemberDialog(false);
              }} className="flex w-full items-center gap-3 px-3 py-2.5 rounded-md hover:bg-accent transition-colors text-left">
                <Avatar className="h-8 w-8"><AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">{getInitials(m.full_name, m.email)}</AvatarFallback></Avatar>
                <div className="min-w-0 flex-1"><p className="text-sm font-medium truncate">{m.full_name || m.email}</p><p className="text-[10px] text-muted-foreground">{m.is_online ? "Online" : "Offline"}</p></div>
              </button>
            ))}
            {members.filter((m) => m.user_id !== user?.id && !groupMembers.some((gm) => gm.user_id === m.user_id)).length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">All workspace members are already in this group</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Group Confirmation */}
      <AlertDialog open={deleteGroupConfirm} onOpenChange={setDeleteGroupConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete group "{groupInfo?.name}"?</AlertDialogTitle><AlertDialogDescription>This will permanently delete the group and its messages.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async () => {
              if (!groupId) return;
              await supabase.from("chat_group_members").delete().eq("group_id", groupId);
              const { error } = await supabase.from("chat_groups").delete().eq("id", groupId);
              if (error) { toast.error("Failed to delete group"); return; }
              queryClient.invalidateQueries({ queryKey: ["chat-groups", workspaceId] });
              toast.success("Group deleted"); setDeleteGroupConfirm(false); setShowGroupMembers(false); navigate("/chat");
            }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Leave Group Confirmation */}
      <AlertDialog open={leaveGroupConfirm} onOpenChange={setLeaveGroupConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Leave group "{groupInfo?.name}"?</AlertDialogTitle><AlertDialogDescription>You will no longer receive messages from this group.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async () => {
              if (!groupId || !user?.id) return;
              const { error } = await supabase.from("chat_group_members").delete().eq("group_id", groupId).eq("user_id", user.id);
              if (error) { toast.error("Failed to leave group"); return; }
              queryClient.invalidateQueries({ queryKey: ["chat-groups", workspaceId] });
              toast.success("You left the group"); setLeaveGroupConfirm(false); setShowGroupMembers(false); navigate("/chat");
            }}>Leave</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Lightbox */}
      {lightboxImages && <ChatLightbox images={lightboxImages} currentIndex={lightboxIndex} onClose={closeLightbox} onNavigate={setLightboxIndex} />}
    </div>
  );
}
