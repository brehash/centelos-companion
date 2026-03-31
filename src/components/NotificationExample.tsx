import { useElectron } from "@/contexts/ElectronContext";
import { Button } from "@/components/ui/button";
import { Bell, Phone, MessageCircle } from "lucide-react";

export default function NotificationExample() {
  const electron = useElectron();

  const showCallNotification = () => {
    if (electron) {
      electron.showNotification({
        title: "Incoming Call",
        body: "John Doe — Ext 101 is calling",
        type: "call",
      });
    } else {
      // Browser fallback
      if (Notification.permission === "granted") {
        new Notification("Incoming Call", { body: "John Doe — Ext 101 is calling" });
      } else {
        Notification.requestPermission();
      }
    }
  };

  const showChatNotification = () => {
    if (electron) {
      electron.showNotification({
        title: "New Message",
        body: "Jane Smith: Hey, are you available for a quick call?",
        type: "chat",
      });
    } else {
      if (Notification.permission === "granted") {
        new Notification("New Message", { body: "Jane Smith: Hey, are you available?" });
      } else {
        Notification.requestPermission();
      }
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-card-foreground flex items-center gap-2">
        <Bell className="h-4 w-4" /> Notification Examples
      </h3>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={showCallNotification} className="flex-1">
          <Phone className="h-3.5 w-3.5 mr-1.5" /> Test Call
        </Button>
        <Button variant="outline" size="sm" onClick={showChatNotification} className="flex-1">
          <MessageCircle className="h-3.5 w-3.5 mr-1.5" /> Test Chat
        </Button>
      </div>
    </div>
  );
}
