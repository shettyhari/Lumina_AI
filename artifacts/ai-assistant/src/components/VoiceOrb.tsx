import { useEffect, useRef } from "react";
import { Mic, MicOff, Volume2, Loader2, X } from "lucide-react";
import { VoiceState } from "@/hooks/useVoiceAgent";
import { cn } from "@/lib/utils";

interface VoiceOrbProps {
  state: VoiceState;
  interimText: string;
  onClose: () => void;
  onStopSpeaking: () => void;
}

// State metadata
const STATE_META: Record<VoiceState, { label: string; hint: string; ringColor: string; orbColor: string }> = {
  idle: {
    label: "Voice Off",
    hint: "",
    ringColor: "border-border/40",
    orbColor: "bg-muted/50",
  },
  wake: {
    label: 'Listening for \u201cHey Lina\u201d',
    hint: 'Say \u201cHey Lina\u201d to start talking',
    ringColor: "border-primary/40",
    orbColor: "bg-primary/10",
  },
  listening: {
    label: "Listening…",
    hint: "Speak your message — pause to send",
    ringColor: "border-cyan-400/70",
    orbColor: "bg-cyan-500/15",
  },
  thinking: {
    label: "Thinking…",
    hint: "",
    ringColor: "border-violet-400/70",
    orbColor: "bg-violet-500/15",
  },
  speaking: {
    label: "Speaking…",
    hint: "Tap to stop",
    ringColor: "border-teal-400/70",
    orbColor: "bg-teal-500/15",
  },
};

// Animated sound-wave bars
function SoundWave({ active, color = "bg-primary" }: { active: boolean; color?: string }) {
  return (
    <div className="flex items-end gap-[3px] h-6">
      {[0, 1, 2, 3, 4].map(i => (
        <div
          key={i}
          className={cn(
            "w-[3px] rounded-full transition-all duration-150",
            color,
            active ? "animate-voice-bar" : "h-[4px] opacity-30"
          )}
          style={active ? { animationDelay: `${i * 80}ms` } : undefined}
        />
      ))}
    </div>
  );
}

// Pulsing glow ring
function PulseRing({ active, color }: { active: boolean; color: string }) {
  return (
    <span
      className={cn(
        "absolute inset-0 rounded-full border-2 transition-all duration-700",
        color,
        active && "animate-pulse-ring"
      )}
    />
  );
}

export default function VoiceOrb({ state, interimText, onClose, onStopSpeaking }: VoiceOrbProps) {
  const meta = STATE_META[state];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  // Particle canvas animation for the orb background
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width = 200;
    const H = canvas.height = 200;
    const cx = W / 2, cy = H / 2;

    let t = 0;
    const draw = () => {
      ctx.clearRect(0, 0, W, H);

      const active = state === "listening" || state === "speaking";
      const rings = active ? 3 : 1;
      const baseRadius = 60;

      for (let r = 0; r < rings; r++) {
        const phase = t * 0.02 + r * 2.1;
        const wobble = active ? Math.sin(t * 0.05 + r) * 12 : 0;
        const radius = baseRadius + wobble + r * 14;
        const alpha = active ? 0.12 - r * 0.03 : 0.06;

        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        if (state === "listening") {
          grad.addColorStop(0, `rgba(34, 211, 238, ${alpha * 2})`);
          grad.addColorStop(1, `rgba(99, 102, 241, 0)`);
        } else if (state === "speaking") {
          grad.addColorStop(0, `rgba(20, 184, 166, ${alpha * 2})`);
          grad.addColorStop(1, `rgba(16, 185, 129, 0)`);
        } else if (state === "thinking") {
          grad.addColorStop(0, `rgba(139, 92, 246, ${alpha * 2.5})`);
          grad.addColorStop(1, `rgba(99, 102, 241, 0)`);
        } else {
          grad.addColorStop(0, `rgba(99, 102, 241, ${alpha})`);
          grad.addColorStop(1, `rgba(99, 102, 241, 0)`);
        }

        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
      }

      t++;
      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [state]);

  const handleOrbClick = () => {
    if (state === "speaking") onStopSpeaking();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-md animate-in fade-in duration-300">

      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-6 right-6 p-2 rounded-full bg-card/80 border border-border/50 text-muted-foreground hover:text-foreground hover:bg-card transition-all"
        aria-label="Close voice mode"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Orb */}
      <div className="relative flex items-center justify-center">
        <canvas ref={canvasRef} width={200} height={200} className="absolute pointer-events-none" />

        <button
          onClick={handleOrbClick}
          className={cn(
            "relative w-28 h-28 rounded-full border-2 flex items-center justify-center transition-all duration-500 shadow-2xl",
            meta.orbColor, meta.ringColor,
            state === "speaking" && "cursor-pointer hover:scale-95"
          )}
        >
          <PulseRing active={state === "wake" || state === "listening"} color={meta.ringColor} />

          {state === "idle" && <MicOff className="w-10 h-10 text-muted-foreground" />}
          {state === "wake" && (
            <div className="flex flex-col items-center gap-2">
              <Mic className="w-8 h-8 text-primary/70" />
              <SoundWave active={false} color="bg-primary/40" />
            </div>
          )}
          {state === "listening" && (
            <div className="flex flex-col items-center gap-2">
              <Mic className="w-8 h-8 text-cyan-400" />
              <SoundWave active color="bg-cyan-400" />
            </div>
          )}
          {state === "thinking" && (
            <Loader2 className="w-10 h-10 text-violet-400 animate-spin" />
          )}
          {state === "speaking" && (
            <div className="flex flex-col items-center gap-2">
              <Volume2 className="w-8 h-8 text-teal-400" />
              <SoundWave active color="bg-teal-400" />
            </div>
          )}
        </button>
      </div>

      {/* State label */}
      <div className="mt-8 text-center space-y-2 px-8 max-w-sm">
        <p className="text-lg font-semibold text-foreground tracking-tight">{meta.label}</p>
        {meta.hint && (
          <p className="text-sm text-muted-foreground">{meta.hint}</p>
        )}
      </div>

      {/* Interim transcript */}
      {interimText && (
        <div className="mt-6 max-w-md px-8 text-center">
          <p className="text-base text-foreground/80 italic leading-relaxed animate-in fade-in">
            "{interimText}"
          </p>
        </div>
      )}

      {/* Wake-word pill — always shown when in wake state */}
      {state === "wake" && (
        <div className="mt-6 flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-4 py-1.5 text-xs text-primary animate-pulse">
          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
          Wake word active
        </div>
      )}
    </div>
  );
}
