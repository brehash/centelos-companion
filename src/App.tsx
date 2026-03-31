import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { isElectron } from "@/contexts/ElectronContext";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ElectronProvider } from "@/contexts/ElectronContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
import { PresenceProvider } from "@/contexts/PresenceContext";
import { VoicePhoneProvider } from "@/contexts/VoicePhoneContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useChatNotifications } from "@/hooks/useChatNotifications";
import { useGlobalUnreadCount } from "@/hooks/useChatMessages";
import { usePresenceContext } from "@/contexts/PresenceContext";
import { useVoicePhoneContext } from "@/contexts/VoicePhoneContext";
import { useEffect } from "react";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import Softphone from "./pages/Softphone";
import ChatWindow from "./pages/ChatWindow";
import Settings from "./pages/Settings";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen bg-background"><div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/** Syncs presence "in-call" status with voice phone */
function PresenceCallSync() {
  const { setInCall } = usePresenceContext();
  const { callStatus } = useVoicePhoneContext();
  useEffect(() => {
    setInCall(callStatus === "in-call" || callStatus === "ringing-out");
  }, [callStatus, setInCall]);
  return null;
}

/** Syncs tray badge with global unread count */
function TrayBadgeSync() {
  const { workspaces } = useWorkspace();
  const count = useGlobalUnreadCount(workspaces.map((w) => w.id));
  useEffect(() => {
    if (window.electronAPI?.setTrayBadge) window.electronAPI.setTrayBadge(count);
  }, [count]);
  return null;
}

/** Enables chat notifications across all workspaces */
function ChatNotificationHandler() {
  useChatNotifications();
  return null;
}

/** Wraps children with workspace-dependent providers */
function WorkspaceProviders({ children }: { children: React.ReactNode }) {
  const { currentWorkspace } = useWorkspace();
  return (
    <PresenceProvider workspaceId={currentWorkspace?.id}>
      <VoicePhoneProvider>
        <PresenceCallSync />
        <TrayBadgeSync />
        <ChatNotificationHandler />
        {children}
      </VoicePhoneProvider>
    </PresenceProvider>
  );
}

const Router = isElectron ? HashRouter : BrowserRouter;

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ElectronProvider>
      <ThemeProvider>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <Router>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/login" element={<Login />} />
                <Route path="/softphone" element={
                  <ProtectedRoute>
                    <WorkspaceProvider>
                      <WorkspaceProviders>
                        <Softphone />
                      </WorkspaceProviders>
                    </WorkspaceProvider>
                  </ProtectedRoute>
                } />
                <Route path="/chat" element={
                  <ProtectedRoute>
                    <WorkspaceProvider>
                      <WorkspaceProviders>
                        <ChatWindow />
                      </WorkspaceProviders>
                    </WorkspaceProvider>
                  </ProtectedRoute>
                } />
                <Route path="/chat/:userId" element={
                  <ProtectedRoute>
                    <WorkspaceProvider>
                      <WorkspaceProviders>
                        <ChatWindow />
                      </WorkspaceProviders>
                    </WorkspaceProvider>
                  </ProtectedRoute>
                } />
                <Route path="/chat/group/:groupId" element={
                  <ProtectedRoute>
                    <WorkspaceProvider>
                      <WorkspaceProviders>
                        <ChatWindow />
                      </WorkspaceProviders>
                    </WorkspaceProvider>
                  </ProtectedRoute>
                } />
                <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Router>
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </ElectronProvider>
  </QueryClientProvider>
);

export default App;
