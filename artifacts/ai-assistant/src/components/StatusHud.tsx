import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { RefreshCw, Radio } from "lucide-react";
import { cn } from "@/lib/utils";

const apiPath = (p: string) => `${import.meta.env.BASE_URL}api${p}`.replace(/\/{2,}/g, "/");

interface BriefingResponse {
  text: string;
  generatedAt: string;
}

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return <>{now.toLocaleTimeString("en-US", { hour12: false })}</>;
}

// Splits a briefing line into a leading label ("Weather:", "Chores:") and
// the rest, so the label can be dimmed and the content emphasized — mirrors
// how buildStatusBriefingText formats each module's line.
function BriefingLine({ line: rawLine }: { line: string }) {
  const line = rawLine.trim();
  const isAlert = line.startsWith("⚠");
  const match = line.match(/^([A-Za-z /]+):\s*(.*)$/);
  return (
    <div className={cn("flex items-start gap-2 py-1.5 border-b border-cyan-400/10 last:border-0", isAlert && "text-amber-300")}>
      <span className={cn("mt-1.5 w-1 h-1 rounded-full shrink-0", isAlert ? "bg-amber-400" : "bg-cyan-400/70")} />
      {match ? (
        <p className="text-xs leading-relaxed">
          <span className="text-cyan-400/60 uppercase tracking-wide">{match[1]}: </span>
          <span className="text-cyan-50/90">{match[2]}</span>
        </p>
      ) : (
        <p className="text-xs leading-relaxed text-cyan-50/90">{line.replace(/^⚠\s*/, "")}</p>
      )}
    </div>
  );
}

export default function StatusHud() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery<BriefingResponse>({
    queryKey: ["status-hud-briefing"],
    queryFn: () => customFetch<BriefingResponse>(apiPath("/status/briefing")),
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60 * 1000,
  });

  const lines = data?.text ? data.text.split("\n").filter(Boolean) : [];

  return (
    <div className="relative rounded-2xl overflow-hidden border border-cyan-400/15 bg-[#02060c] hud-grid-bg font-mono">
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(circle at 20% 0%, rgba(34,211,238,0.08), transparent 60%)" }} />

      {/* corner brackets, subtle */}
      {["top-2 left-2 border-t border-l", "top-2 right-2 border-t border-r", "bottom-2 left-2 border-b border-l", "bottom-2 right-2 border-b border-r"].map((pos) => (
        <div key={pos} className={cn("absolute w-3 h-3 border-cyan-400/25 pointer-events-none", pos)} />
      ))}

      <div className="relative px-5 py-4 flex items-center justify-between border-b border-cyan-400/10">
        <div className="flex items-center gap-2">
          <Radio className="w-3.5 h-3.5 text-cyan-400 animate-hud-blip" />
          <span className="text-[11px] font-bold tracking-[0.2em] text-cyan-400 hud-text-glow">LINA // STATUS</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] tracking-widest text-cyan-400/50 hidden sm:inline"><Clock /></span>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="text-cyan-400/60 hover:text-cyan-300 transition-colors disabled:opacity-40"
            aria-label="Refresh status"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
          </button>
        </div>
      </div>

      <div className="relative px-5 py-3 min-h-[88px]">
        {isLoading ? (
          <div className="flex items-center gap-2 text-cyan-400/50 text-xs py-2">
            <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-hud-blip" />
            Pulling household status…
          </div>
        ) : isError ? (
          <p className="text-xs text-red-400/80 py-2">Couldn't reach the status feed. <button onClick={() => refetch()} className="underline hover:text-red-300">Retry</button></p>
        ) : lines.length === 0 ? (
          <p className="text-xs text-cyan-100/40 py-2">All quiet — nothing notable to report right now.</p>
        ) : (
          <div>
            {lines.map((line, i) => <BriefingLine key={i} line={line} />)}
          </div>
        )}
      </div>
    </div>
  );
}
