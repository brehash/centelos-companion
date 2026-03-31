import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import FramelessTitleBar from "@/components/FramelessTitleBar";
import DialPad from "@/components/DialPad";
import CallControls from "@/components/CallControls";
import IncomingCallBanner from "@/components/IncomingCallBanner";
import {
  Phone, PhoneOutgoing, Delete, AlertCircle, Headphones,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

const KEY_MAP: Record<string, string> = {
  Numpad0: "0", Numpad1: "1", Numpad2: "2", Numpad3: "3",
  Numpad4: "4", Numpad5: "5", Numpad6: "6", Numpad7: "7",
  Numpad8: "8", Numpad9: "9", NumpadMultiply: "*", NumpadDecimal: "#",
  Digit0: "0", Digit1: "1", Digit2: "2", Digit3: "3",
  Digit4: "4", Digit5: "5", Digit6: "6", Digit7: "7",
  Digit8: "8", Digit9: "9",
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

type CallStatus = "idle" | "ringing-in" | "ringing-out" | "in-call";
type PhoneStatus = "connecting" | "registered" | "error" | "unregistered";

export default function Softphone() {
  const { user } = useAuth();
  const [dialNumber, setDialNumber] = useState("");
  const [callStatus, setCallStatus] = useState<CallStatus>("idle");
  const [phoneStatus, setPhoneStatus] = useState<PhoneStatus>("registered");
  const [isMuted, setIsMuted] = useState(false);
  const [isOnHold, setIsOnHold] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [showAudioSettings, setShowAudioSettings] = useState(false);
  const [incomingFrom, setIncomingFrom] = useState("");

  // Simulated call timer
  useEffect(() => {
    if (callStatus !== "in-call") return;
    const interval = setInterval(() => setCallDuration((d) => d + 1), 1000);
    return () => clearInterval(interval);
  }, [callStatus]);

  const statusColor =
    phoneStatus === "registered" ? "bg-green-500" :
    phoneStatus === "error" ? "bg-destructive" :
    phoneStatus === "connecting" ? "bg-warning animate-pulse" :
    "bg-muted-foreground";

  const handleDigit = useCallback((digit: string) => {
    if (callStatus === "in-call") {
      // DTMF
      console.log("DTMF:", digit);
    } else {
      setDialNumber((prev) => prev + digit);
    }
  }, [callStatus]);

  const handleDial = useCallback(() => {
    if (!dialNumber.trim()) return;
    setCallStatus("ringing-out");
    // Simulate connect after 2s
    setTimeout(() => setCallStatus("in-call"), 2000);
  }, [dialNumber]);

  const handleHangUp = () => {
    setCallStatus("idle");
    setCallDuration(0);
    setIsMuted(false);
    setIsOnHold(false);
  };

  const handleAcceptCall = () => {
    setCallStatus("in-call");
    setCallDuration(0);
  };

  const handleRejectCall = () => {
    setCallStatus("idle");
    setIncomingFrom("");
  };

  // Keyboard support
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      const digit = KEY_MAP[e.code];
      if (digit) {
        e.preventDefault();
        handleDigit(digit);
      }
      if (e.key === "Backspace") {
        e.preventDefault();
        setDialNumber((prev) => prev.slice(0, -1));
      }
      if (e.key === "Enter" && callStatus === "idle" && dialNumber.trim()) {
        e.preventDefault();
        handleDial();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [handleDigit, callStatus, dialNumber, handleDial]);

  // Demo: simulate incoming call
  const simulateIncoming = () => {
    setIncomingFrom("+1 (555) 123-4567");
    setCallStatus("ringing-in");
  };

  const isInCall = callStatus === "in-call";
  const isIdle = callStatus === "idle";

  return (
    <div className="flex flex-col h-screen bg-card overflow-hidden">
      <FramelessTitleBar title="Centelos Softphone" />

      {/* Status bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
        <Phone className="h-4 w-4 text-primary" />
        <span className="text-xs font-medium text-card-foreground">
          {user?.email || "Softphone"}
        </span>
        <div className={cn("h-2 w-2 rounded-full ml-auto", statusColor)} />
        <span className="text-[10px] text-muted-foreground capitalize">{phoneStatus}</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Incoming call banner */}
        {callStatus === "ringing-in" && (
          <IncomingCallBanner
            callerName=""
            callerNumber={incomingFrom}
            onAccept={handleAcceptCall}
            onReject={handleRejectCall}
          />
        )}

        {/* In-call view */}
        {(isInCall || callStatus === "ringing-out") && (
          <div className="p-5 text-center space-y-3">
            <PhoneOutgoing className="h-8 w-8 mx-auto text-primary" />
            <p className="text-sm font-medium text-card-foreground">
              {isInCall ? `In Call — ${dialNumber}` : `Calling ${dialNumber}…`}
            </p>
            {isOnHold && (
              <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-warning/20 text-warning font-medium">
                On Hold
              </span>
            )}
            {isInCall && (
              <p className="text-2xl font-mono text-card-foreground">
                {formatDuration(callDuration)}
              </p>
            )}
            <CallControls
              isMuted={isMuted}
              isOnHold={isOnHold}
              onToggleMute={() => setIsMuted((m) => !m)}
              onToggleHold={() => setIsOnHold((h) => !h)}
              onHangUp={handleHangUp}
              disabled={!isInCall}
            />
          </div>
        )}

        {/* Idle dial pad */}
        {callStatus === "idle" && (
          <div className="p-4 space-y-3">
            <div className="flex gap-1">
              <Input
                value={dialNumber}
                onChange={(e) => setDialNumber(e.target.value)}
                placeholder="Number or @name…"
                className="text-sm h-9"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleDial();
                }}
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={() => setDialNumber((prev) => prev.slice(0, -1))}
                disabled={!dialNumber}
              >
                <Delete className="h-4 w-4" />
              </Button>
            </div>

            <DialPad onDigit={handleDigit} />

            <Button
              className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
              onClick={handleDial}
              disabled={!dialNumber.trim() || phoneStatus !== "registered"}
            >
              <Phone className="h-4 w-4 mr-2" /> Call
            </Button>

            {/* Audio settings toggle */}
            <div className="pt-2 border-t border-border">
              <button
                onClick={() => setShowAudioSettings((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
              >
                <Headphones className="h-3 w-3" />
                <span>Audio Devices</span>
                {showAudioSettings ? (
                  <ChevronUp className="h-3 w-3 ml-auto" />
                ) : (
                  <ChevronDown className="h-3 w-3 ml-auto" />
                )}
              </button>
              {showAudioSettings && (
                <div className="mt-2 text-xs text-muted-foreground animate-in slide-in-from-top-2 duration-200">
                  <p>Audio device selection will be available when WebRTC/SIP is connected.</p>
                </div>
              )}
            </div>

            {/* Demo button */}
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs"
              onClick={simulateIncoming}
            >
              <AlertCircle className="h-3.5 w-3.5 mr-1.5" /> Simulate Incoming Call
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
