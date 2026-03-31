import { X, Minus, GripHorizontal } from "lucide-react";
import { useElectron } from "@/contexts/ElectronContext";
import { cn } from "@/lib/utils";

interface FramelessTitleBarProps {
  title?: string;
  showMinimize?: boolean;
  showClose?: boolean;
  onClose?: () => void;
  className?: string;
}

export default function FramelessTitleBar({
  title,
  showMinimize = false,
  showClose = true,
  onClose,
  className,
}: FramelessTitleBarProps) {
  const electron = useElectron();

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      electron?.hideWindow();
    }
  };

  return (
    <div
      className={cn(
        "flex items-center justify-between h-8 px-2 bg-card border-b border-border select-none",
        className
      )}
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <GripHorizontal className="h-3 w-3 text-muted-foreground/50" />
        {title && (
          <span className="text-xs font-medium text-muted-foreground truncate">
            {title}
          </span>
        )}
      </div>
      <div
        className="flex items-center gap-0.5"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        {showMinimize && (
          <button
            onClick={() => electron?.minimizeWindow()}
            className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Minus className="h-3 w-3" />
          </button>
        )}
        {showClose && (
          <button
            onClick={handleClose}
            className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:bg-destructive hover:text-destructive-foreground transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
