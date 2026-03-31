import { Button } from "@/components/ui/button";
import { PhoneIncoming, Phone, PhoneOff, MessageCircle } from "lucide-react";

interface IncomingCallBannerProps {
  callerName: string;
  callerNumber: string;
  onAccept: () => void;
  onReject: () => void;
  onChat?: () => void;
}

export default function IncomingCallBanner({
  callerName,
  callerNumber,
  onAccept,
  onReject,
  onChat,
}: IncomingCallBannerProps) {
  return (
    <div className="p-4 border-b border-border bg-accent/10 animate-in slide-in-from-top duration-300">
      <div className="flex items-center gap-3 mb-3">
        <PhoneIncoming className="h-5 w-5 text-accent animate-pulse" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-card-foreground">Incoming Call</p>
          <p className="text-xs text-muted-foreground truncate">
            {callerName || callerNumber}
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        {onChat && (
          <Button size="sm" variant="outline" className="shrink-0" onClick={onChat} title="Chat">
            <MessageCircle className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button
          size="sm"
          className="flex-1 bg-accent hover:bg-accent/90 text-accent-foreground"
          onClick={onAccept}
        >
          <Phone className="h-3.5 w-3.5 mr-1" /> Accept
        </Button>
        <Button size="sm" variant="destructive" className="flex-1" onClick={onReject}>
          <PhoneOff className="h-3.5 w-3.5 mr-1" /> Reject
        </Button>
      </div>
    </div>
  );
}
