import { Button } from "@/components/ui/button";
import {
  Phone, PhoneOff, Mic, MicOff, Pause, Play,
  PhoneForwarded, ArrowRightLeft,
} from "lucide-react";

interface CallControlsProps {
  isMuted: boolean;
  isOnHold: boolean;
  onToggleMute: () => void;
  onToggleHold: () => void;
  onHangUp: () => void;
  onBlindTransfer?: () => void;
  onAttendedTransfer?: () => void;
  disabled?: boolean;
}

export default function CallControls({
  isMuted,
  isOnHold,
  onToggleMute,
  onToggleHold,
  onHangUp,
  onBlindTransfer,
  onAttendedTransfer,
  disabled,
}: CallControlsProps) {
  return (
    <div className="flex justify-center gap-2">
      <Button
        size="icon"
        variant={isMuted ? "destructive" : "outline"}
        onClick={onToggleMute}
        title={isMuted ? "Unmute" : "Mute"}
        disabled={disabled}
      >
        {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
      </Button>
      <Button
        size="icon"
        variant={isOnHold ? "secondary" : "outline"}
        onClick={onToggleHold}
        title={isOnHold ? "Resume" : "Hold"}
        disabled={disabled}
      >
        {isOnHold ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
      </Button>
      {onBlindTransfer && (
        <Button
          size="icon"
          variant="outline"
          onClick={onBlindTransfer}
          title="Blind Transfer"
          disabled={disabled}
        >
          <PhoneForwarded className="h-4 w-4" />
        </Button>
      )}
      {onAttendedTransfer && (
        <Button
          size="icon"
          variant="outline"
          onClick={onAttendedTransfer}
          title="Attended Transfer"
          disabled={disabled}
        >
          <ArrowRightLeft className="h-4 w-4" />
        </Button>
      )}
      <Button size="icon" variant="destructive" onClick={onHangUp}>
        <PhoneOff className="h-4 w-4" />
      </Button>
    </div>
  );
}
