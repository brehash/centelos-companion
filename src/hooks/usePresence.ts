// Thin wrapper — all logic lives in PresenceProvider.
export type { PresenceStatus, PresenceMember, DeskPhoneStatus } from "@/contexts/PresenceContext";
import { usePresenceContext } from "@/contexts/PresenceContext";

export function usePresence(_workspaceId?: string | undefined) {
  return usePresenceContext();
}
