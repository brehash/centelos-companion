import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { usePresence, PresenceMember } from "@/hooks/usePresence";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function getInitials(name: string | null, email: string | null) {
  const s = name || email || "?";
  return s.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

interface CreateGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  onCreated: (groupId: string) => void;
}

export default function CreateGroupDialog({ open, onOpenChange, workspaceId, onCreated }: CreateGroupDialogProps) {
  const { user } = useAuth();
  const { members } = usePresence(workspaceId);
  const [name, setName] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  const otherMembers = members.filter((m) => m.user_id !== user?.id);

  const toggleMember = (userId: string) => {
    setSelectedIds((prev) => { const next = new Set(prev); if (next.has(userId)) next.delete(userId); else next.add(userId); return next; });
  };

  const handleCreate = async () => {
    if (!name.trim() || selectedIds.size === 0 || !user) return;
    setCreating(true);
    try {
      const { data: group, error } = await supabase.from("chat_groups" as any).insert({ workspace_id: workspaceId, name: name.trim(), created_by: user.id } as any).select("id").single();
      if (error || !group) throw error || new Error("Failed to create group");
      const groupId = (group as any).id;
      const memberRows = [user.id, ...Array.from(selectedIds)].map((uid) => ({ group_id: groupId, user_id: uid }));
      const { error: membersError } = await supabase.from("chat_group_members" as any).insert(memberRows as any);
      if (membersError) throw membersError;
      toast.success("Group created");
      setName("");
      setSelectedIds(new Set());
      onOpenChange(false);
      onCreated(groupId);
    } catch (err: any) { console.error("Create group error:", err); toast.error("Failed to create group"); }
    finally { setCreating(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Create Group Chat</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <Input placeholder="Group name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <div className="space-y-1 max-h-60 overflow-auto">
            <p className="text-xs text-muted-foreground font-medium mb-2">Select members</p>
            {otherMembers.length === 0 && <p className="text-xs text-muted-foreground">No other members in this workspace.</p>}
            {otherMembers.map((m) => (
              <button key={m.user_id} type="button" onClick={() => toggleMember(m.user_id)}
                className={cn("flex w-full items-center gap-3 px-3 py-2 rounded-md transition-colors text-left", selectedIds.has(m.user_id) ? "bg-accent" : "hover:bg-accent/50")}>
                <Checkbox checked={selectedIds.has(m.user_id)} className="pointer-events-none" />
                <Avatar className="h-7 w-7"><AvatarFallback className="text-[10px] bg-primary/10 text-primary font-semibold">{getInitials(m.full_name, m.email)}</AvatarFallback></Avatar>
                <span className="text-sm truncate">{m.full_name || m.email || "Unknown"}</span>
              </button>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={creating || !name.trim() || selectedIds.size === 0}>{creating ? "Creating…" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
