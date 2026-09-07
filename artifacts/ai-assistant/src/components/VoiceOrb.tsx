import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Volume2, Loader2, X, AlertTriangle } from "lucide-react";
import { VoiceState } from "@/hooks/useVoiceAgent";
import { cn } from "@/lib/utils";

interface VoiceOrbProps {
  state: VoiceState;
  interimText: string;
  errorMessage?: string | null;
  onClose: () => void;
  onStopSpeaking: () => void;
  onRetry?: () => void;
}

// State metadata — HUD palette, cyan/blue "arc reactor" family with amber/red
// reserved for diagnostic (thinking) and alert (error) states.
const STATE_META: Record<
  VoiceState,
  { label: string; hint: string; hex: string; ring: string; text: string }
> = {
  idle: {
    label: "SYSTEM STANDBY",
    hint: "",
    hex: "#3b4a5a",
    ring: "border-slate-500/30",
    text: "text-slate-400",
  },
  wake: {
    label: 'AWAITING "HEY LINA"',
    hint: "Say “Hey Lina” to begin",
    hex: "#38d6ff",
    ring: "border-cyan-400/40",
    text: "text-cyan-300",
  },
  listening: {
    label: "LISTENING",
    hint: "Speak now — pause to send",
    hex: "#22e3ff",
    ring: "border-cyan-300/70",
    text: "text-cyan-300",
  },
  thinking: {
    label: "PROCESSING",
    hint: "",
    hex: "#8b7bff",
    ring: "border-indigo-400/70",
    text: "text-indigo-300",
  },
  speaking: {
    label: "RESPONDING",
    hint: "Tap core to stop",
    hex: "#2dd4bf",
    ring: "border-teal-300/70",
    text: "text-teal-300",
  },
  error: {
    label: "LINK FAULT",
    hint: "Tap core to retry",
    hex: "#ff4d4f",
    ring: "border-red-400/60",
    text: "text-red-400",
  },
};

// Animated sound-wave bars
function SoundWave({ active, hex }: { active: boolean; hex: string }) {
  return (
    <div className="flex items-end gap-[3px] h-6">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className={cn("w-[3px] rounded-full transition-all duration-150", active ? "animate-voice-bar" : "h-[4px] opacity-30")}
          style={{ background: hex, animationDelay: active ? `${i * 80}ms` : undefined }}
        />
      ))}
    </div>
  );
}

// Concentric HUD rings: tick-marked outer ring, dashed mid ring, orbiting node
function HudRings({ hex, active }: { hex: string; active: boolean }) {
  const ticks = Array.from({ length: 48 });
  return (
    <svg viewBox="0 0 240 240" className="absolute inset-0 w-full h-full pointer-events-none" style={{ color: hex }}>
      {/* outer tick ring — slow rotation */}
      <g className="animate-hud-spin origin-center" style={{ transformOrigin: "120px 120px" }}>
        {ticks.map((_, i) => {
          const angle = (i / ticks.length) * 360;
          const long = i % 4 === 0;
          return (
            <line
              key={i}
              x1={120}
              y1={long ? 8 : 14}
              x2={120}
              y2={long ? 18 : 20}
              stroke="currentColor"
              strokeWidth={long ? 2 : 1}
              opacity={long ? 0.85 : 0.4}
              transform={`rotate(${angle} 120 120)`}
            />
          );
        })}
      </g>

      {/* dashed mid ring — reverse rotation */}
      <circle
        cx={120}
        cy={120}
        r={92}
        fill="none"
        stroke="currentColor"
        strokeWidth={1}
        strokeDasharray="2 10"
        opacity={0.5}
        className="animate-hud-spin-reverse origin-center"
        style={{ transformOrigin: "120px 120px" }}
      />

      {/* solid base ring */}
      <circle cx={120} cy={120} r={104} fill="none" stroke="currentColor" strokeWidth={1} opacity={0.25} />

      {/* radar sweep arc — only visible while actively engaged */}
      {active && (
        <g className="animate-hud-spin-fast origin-center" style={{ transformOrigin: "120px 120px" }}>
          <path d="M 120 120 L 120 16 A 104 104 0 0 1 190 46 Z" fill="currentColor" opacity={0.08} />
        </g>
      )}

      {/* orbiting node */}
      <g className="animate-hud-spin origin-center" style={{ transformOrigin: "120px 120px", animationDuration: "9s" }}>
        <circle cx={120} cy={16} r={3} fill="currentColor" className="animate-hud-blip" />
      </g>
    </svg>
  );
}

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return <>{now.toLocaleTimeString("en-US", { hour12: false })}</>;
}

export default function VoiceOrb({ state, interimText, errorMessage, onClose, onStopSpeaking, onRetry }: VoiceOrbProps) {
  const meta = STATE_META[state];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const active = state === "listening" || state === "speaking" || state === "thinking";

  // Plasma-core canvas animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = (canvas.width = 240);
    const H = (canvas.height = 240);
    const cx = W / 2,
      cy = H / 2;

    let t = 0;
    const draw = () => {
      ctx.clearRect(0, 0, W, H);

      const rings = active ? 3 : 1;
      const baseRadius = 34;

      for (let r = 0; r < rings; r++) {
        const wobble = active ? Math.sin(t * 0.06 + r * 1.4) * 6 : Math.sin(t * 0.015) * 2;
        const radius = baseRadius + wobble + r * 9;
        const alpha = active ? 0.28 - r * 0.06 : 0.14;

        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        grad.addColorStop(0, hexToRgba(meta.hex, alpha * 2));
        grad.addColorStop(1, hexToRgba(meta.hex, 0));

        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
      }

      // bright core
      const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 16);
      coreGrad.addColorStop(0, hexToRgba("#ffffff", active ? 0.9 : 0.5));
      coreGrad.addColorStop(1, hexToRgba(meta.hex, 0));
      ctx.beginPath();
      ctx.arc(cx, cy, 16, 0, Math.PI * 2);
      ctx.fillStyle = coreGrad;
      ctx.fill();

      t++;
      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [state, active, meta.hex]);

  const handleOrbClick = () => {
    if (state === "speaking") onStopSpeaking();
    if (state === "error") onRetry?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#02060c]/95 hud-grid-bg backdrop-blur-md animate-in fade-in duration-300 overflow-hidden font-mono">
      {/* radial vignette */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(circle at center, transparent 0%, #02060c 78%)" }} />

      {/* scanning sweep band */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-40">
        <div
          className="absolute left-0 right-0 h-24 animate-hud-scan"
          style={{ background: `linear-gradient(180deg, transparent, ${meta.hex}22, transparent)` }}
        />
      </div>

      {/* ─── Corner telemetry ─── */}
      <div className="absolute top-6 left-6 text-[10px] tracking-[0.2em] text-cyan-400/70 space-y-0.5 select-none animate-hud-flicker">
        <div className="hud-text-glow text-cyan-400">LINA // NEURAL LINK</div>
        <div className="text-cyan-400/50">PROTOCOL: SECURE</div>
      </div>
      <div className="absolute top-6 right-6 text-[10px] tracking-[0.2em] text-cyan-400/70 text-right space-y-0.5 select-none">
        <div className="hud-text-glow text-cyan-400"><Clock /></div>
        <div className="text-cyan-400/50">STATUS: {state === "idle" ? "STANDBY" : "ONLINE"}</div>
      </div>
      <div className="absolute bottom-6 left-6 text-[10px] tracking-[0.2em] text-cyan-400/50 select-none hidden sm:block">
        <div>STATE_CODE: {state.toUpperCase().padEnd(8, "_")}</div>
      </div>
      <div className="absolute bottom-6 right-6 text-[10px] tracking-[0.2em] text-cyan-400/50 select-none hidden sm:block">
        <div className="flex items-center gap-1.5 justify-end">
          <span className={cn("w-1.5 h-1.5 rounded-full", active ? "bg-cyan-400 animate-hud-blip" : "bg-slate-600")} />
          AUDIO CHANNEL {active ? "LIVE" : "IDLE"}
        </div>
      </div>

      {/* corner brackets */}
      {[
        "top-4 left-4 border-t-2 border-l-2",
        "top-4 right-4 border-t-2 border-r-2",
        "bottom-4 left-4 border-b-2 border-l-2",
        "bottom-4 right-4 border-b-2 border-r-2",
      ].map((pos) => (
        <div key={pos} className={cn("absolute w-8 h-8 border-cyan-400/30 pointer-events-none", pos)} />
      ))}

      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-16 right-6 sm:top-6 sm:right-24 p-2 rounded-full bg-cyan-500/5 border border-cyan-400/20 text-cyan-400/70 hover:text-cyan-300 hover:border-cyan-400/50 hover:bg-cyan-500/10 transition-all"
        aria-label="Close voice mode"
      >
        <X className="w-5 h-5" />
      </button>

      {/* ─── Core HUD orb ─── */}
      <div className="relative flex items-center justify-center w-60 h-60">
        <HudRings hex={meta.hex} active={active} />
        <canvas ref={canvasRef} width={240} height={240} className="absolute pointer-events-none" />

        <button
          onClick={handleOrbClick}
          className={cn(
            "relative w-24 h-24 rounded-full border flex items-center justify-center transition-all duration-500",
            meta.ring,
            (state === "speaking" || state === "error") && "cursor-pointer hover:scale-95",
          )}
          style={{ boxShadow: `0 0 30px ${hexToRgba(meta.hex, 0.35)}, inset 0 0 20px ${hexToRgba(meta.hex, 0.15)}` }}
        >
          {state === "idle" && <MicOff className="w-9 h-9 text-slate-500" />}
          {state === "wake" && (
            <div className="flex flex-col items-center gap-2">
              <Mic className="w-7 h-7" style={{ color: meta.hex }} />
              <SoundWave active={false} hex={meta.hex} />
            </div>
          )}
          {state === "listening" && (
            <div className="flex flex-col items-center gap-2">
              <Mic className="w-7 h-7" style={{ color: meta.hex }} />
              <SoundWave active hex={meta.hex} />
            </div>
          )}
          {state === "thinking" && <Loader2 className="w-9 h-9 animate-spin" style={{ color: meta.hex }} />}
          {state === "speaking" && (
            <div className="flex flex-col items-center gap-2">
              <Volume2 className="w-7 h-7" style={{ color: meta.hex }} />
              <SoundWave active hex={meta.hex} />
            </div>
          )}
          {state === "error" && <AlertTriangle className="w-9 h-9 text-red-400" />}
        </button>
      </div>

      {/* State label */}
      <div className="mt-8 text-center space-y-2 px-8 max-w-sm">
        <p className={cn("text-sm font-bold tracking-[0.25em] hud-text-glow", meta.text)}>{meta.label}</p>
        {state === "error" && errorMessage && <p className="text-xs text-red-400/90 font-sans">{errorMessage}</p>}
        {meta.hint && <p className="text-xs text-cyan-100/40 tracking-wide">{meta.hint}</p>}
      </div>

      {/* Interim transcript */}
      {interimText && (
        <div className="mt-6 max-w-md px-8 text-center">
          <p className="text-base text-cyan-100/80 italic leading-relaxed animate-in fade-in font-sans">"{interimText}"</p>
        </div>
      )}

      {/* Wake-word pill */}
      {state === "wake" && (
        <div className="mt-6 flex items-center gap-2 bg-cyan-500/10 border border-cyan-400/20 rounded-full px-4 py-1.5 text-[11px] tracking-wider text-cyan-300">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-hud-blip" />
          WAKE WORD ACTIVE
        </div>
      )}
    </div>
  );
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const bigint = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
