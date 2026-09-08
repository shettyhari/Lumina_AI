import { useEffect, useState } from "react";
import { Brain } from "lucide-react";
import { cn } from "@/lib/utils";

interface MemoryToastProps {
  message: string | null;
  onDismiss: () => void;
}

export function MemoryToast({ message, onDismiss }: MemoryToastProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!message) { setVisible(false); return; }
    setVisible(true);
    const t = setTimeout(() => { setVisible(false); setTimeout(onDismiss, 300); }, 4000);
    return () => clearTimeout(t);
  }, [message]);

  return (
    <div
      className={cn(
        "fixed bottom-24 right-6 z-50 flex items-center gap-2 rounded-xl border border-violet-400/30 bg-card px-4 py-3 shadow-2xl text-sm font-medium text-foreground transition-all duration-300 max-w-xs",
        visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0 pointer-events-none"
      )}
    >
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-400/20">
        <Brain className="h-3.5 w-3.5 text-violet-400" />
      </div>
      <span className="truncate">Remembered: {message}</span>
    </div>
  );
}
