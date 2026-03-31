import { useEffect, useCallback } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

interface ChatLightboxProps {
  images: { url: string; name?: string }[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

export default function ChatLightbox({ images, currentIndex, onClose, onNavigate }: ChatLightboxProps) {
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < images.length - 1;

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    if (e.key === "ArrowLeft" && hasPrev) onNavigate(currentIndex - 1);
    if (e.key === "ArrowRight" && hasNext) onNavigate(currentIndex + 1);
  }, [onClose, onNavigate, currentIndex, hasPrev, hasNext]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", handleKeyDown); document.body.style.overflow = ""; };
  }, [handleKeyDown]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90" onClick={onClose}>
      <button onClick={onClose} className="absolute top-4 right-4 z-10 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors">
        <X className="h-5 w-5" />
      </button>
      {hasPrev && (
        <button onClick={(e) => { e.stopPropagation(); onNavigate(currentIndex - 1); }} className="absolute left-4 z-10 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      <img src={images[currentIndex]?.url} alt={images[currentIndex]?.name || "Image"} className="max-w-[90vw] max-h-[85vh] object-contain select-none" onClick={(e) => e.stopPropagation()} draggable={false} />
      {hasNext && (
        <button onClick={(e) => { e.stopPropagation(); onNavigate(currentIndex + 1); }} className="absolute right-4 z-10 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors">
          <ChevronRight className="h-5 w-5" />
        </button>
      )}
      {images.length > 1 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/70 text-sm">{currentIndex + 1} / {images.length}</div>
      )}
    </div>
  );
}
