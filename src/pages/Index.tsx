import { useAuth } from "@/contexts/AuthContext";
import { Navigate, useNavigate } from "react-router-dom";
import { isElectron } from "@/contexts/ElectronContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Phone, MessageCircle, Settings } from "lucide-react";

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isElectron && user) return <Navigate to="/chat" replace />;
  if (isElectron && !user) return <Navigate to="/login" replace />;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-lg w-full space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Phone className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Centelos Desktop</h1>
          <p className="text-muted-foreground">Professional VoIP softphone & chat for your desktop</p>
        </div>

        {user ? (
          <div className="grid gap-3">
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate("/softphone")}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Phone className="h-4 w-4 text-accent" /> Softphone
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>Make and receive calls with the dial pad</CardDescription>
              </CardContent>
            </Card>
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate("/chat")}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-primary" /> Chat
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>Direct messages and group conversations</CardDescription>
              </CardContent>
            </Card>
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate("/settings")}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings className="h-4 w-4 text-muted-foreground" /> Settings
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>Theme, startup mode, and account</CardDescription>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="space-y-3">
            <Button className="w-full" onClick={() => navigate("/login")}>Sign In</Button>
            <p className="text-xs text-center text-muted-foreground">
              Download the Electron desktop app for system tray integration
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;
