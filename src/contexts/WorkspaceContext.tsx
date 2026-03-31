import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./AuthContext";

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  twilio_sip_domain: string | null;
  logo_url: string | null;
  timezone: string;
  role: string;
}

interface WorkspaceContextType {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  setCurrentWorkspace: (ws: Workspace | null) => void;
  loading: boolean;
  refresh: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchWorkspaces = useCallback(async () => {
    if (!user) {
      setWorkspaces([]);
      setCurrentWorkspace(null);
      setLoading(false);
      return;
    }

    const { data: memberships } = await supabase
      .from("memberships")
      .select("workspace_id, role, workspaces(id, name, slug, twilio_sip_domain, logo_url, timezone, is_active)")
      .eq("user_id", user.id);

    if (memberships) {
      const wsList = memberships
        .filter((m: any) => m.workspaces?.is_active !== false)
        .map((m: any) => ({
          id: m.workspaces.id,
          name: m.workspaces.name,
          slug: m.workspaces.slug,
          twilio_sip_domain: m.workspaces.twilio_sip_domain,
          logo_url: m.workspaces.logo_url,
          timezone: m.workspaces.timezone ?? "America/New_York",
          role: m.role,
        }));
      setWorkspaces(wsList);
      setCurrentWorkspace((prev) => {
        if (prev) {
          const match = wsList.find((ws: Workspace) => ws.id === prev.id);
          if (match) return match;
        }
        return wsList[0] ?? null;
      });
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  useEffect(() => {
    if (!user || workspaces.length === 0) return;
    const channel = supabase
      .channel("workspace-realtime")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "workspaces" }, (payload) => {
        if (workspaces.some((ws) => ws.id === payload.new.id)) {
          fetchWorkspaces();
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, workspaces.length, fetchWorkspaces]);

  return (
    <WorkspaceContext.Provider value={{ workspaces, currentWorkspace, setCurrentWorkspace, loading, refresh: fetchWorkspaces }}>
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return context;
};
