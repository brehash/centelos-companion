import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useElectron } from "@/contexts/ElectronContext";
import FramelessTitleBar from "@/components/FramelessTitleBar";
import NotificationExample from "@/components/NotificationExample";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Settings as SettingsIcon, Palette, Monitor, LogOut, User } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function Settings() {
  const { user, profile, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const electron = useElectron();
  const navigate = useNavigate();
  const [startInTray, setStartInTray] = useState(true);

  useEffect(() => {
    if (electron) {
      electron.getSettings().then((s) => {
        setStartInTray(s.startInTray ?? true);
      });
    }
  }, [electron]);

  const handleStartInTrayChange = (checked: boolean) => {
    setStartInTray(checked);
    if (electron) {
      electron.getSettings().then((s) => {
        electron.setSettings({ ...s, startInTray: checked });
      });
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <FramelessTitleBar title="Settings" />

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* User info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <User className="h-4 w-4" /> Account
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <p className="text-sm font-medium">{profile?.full_name || "User"}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
          </CardContent>
        </Card>

        {/* Startup mode */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Monitor className="h-4 w-4" /> Startup
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <Label htmlFor="tray-mode" className="text-sm">
                Start minimized in tray
              </Label>
              <Switch
                id="tray-mode"
                checked={startInTray}
                onCheckedChange={handleStartInTrayChange}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {startInTray
                ? "App starts hidden in the system tray"
                : "App opens the softphone window on startup"}
            </p>
          </CardContent>
        </Card>

        {/* Appearance */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Palette className="h-4 w-4" /> Appearance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <Label className="text-sm">Theme</Label>
              <Select value={theme} onValueChange={(v) => setTheme(v as any)}>
                <SelectTrigger className="w-32 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">System</SelectItem>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardContent className="pt-5">
            <NotificationExample />
          </CardContent>
        </Card>

        {/* Sign out */}
        <Button
          variant="outline"
          className="w-full text-destructive hover:text-destructive"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4 mr-2" /> Sign Out
        </Button>
      </div>
    </div>
  );
}
