import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Sun, RefreshCw, Sparkles, Calendar, CheckSquare, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";

interface BriefingData { text: string; cached: boolean; generatedAt?: string; }

function getGreetingTime() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function BriefingPage() {
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery<BriefingData>({
    queryKey: ["briefing"],
    queryFn: () => customFetch("/api/briefing/morning"),
    staleTime: 30 * 60 * 1000,
  });

  function refresh() {
    customFetch("/api/briefing/cache", { method: "DELETE" }).then(() => {
      qc.invalidateQueries({ queryKey: ["briefing"] });
    });
  }

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="min-h-screen bg-background p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-sm text-muted-foreground">{today}</p>
          <h1 className="text-2xl font-bold flex items-center gap-2 mt-1">
            <Sun className="h-6 w-6 text-yellow-500" /> {getGreetingTime()}, Family!
          </h1>
        </div>
        <button onClick={refresh} className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/80">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {/* AI Briefing Card */}
      <div className="relative rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20 p-6 mb-6 overflow-hidden">
        <div className="absolute top-3 right-4 opacity-10">
          <Sparkles className="h-16 w-16 text-primary" />
        </div>
        <div className="flex items-center gap-2 mb-3">
          <div className="rounded-full bg-primary/10 p-1.5">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <span className="text-xs font-medium text-primary uppercase tracking-wider">Lina AI Briefing</span>
          {data?.cached && <span className="text-xs text-muted-foreground">(cached)</span>}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <div key={i} className={cn("h-4 rounded-full bg-muted animate-pulse", i === 3 ? "w-2/3" : "w-full")} />)}
          </div>
        ) : error ? (
          <p className="text-muted-foreground text-sm">Unable to generate briefing. Check your AI settings.</p>
        ) : (
          <p className="text-base leading-relaxed">{data?.text}</p>
        )}

        {data?.generatedAt && (
          <p className="text-xs text-muted-foreground mt-4">Generated at {new Date(data.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
        )}
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-3 gap-4">
        <a href="/calendar" className="rounded-xl border bg-card p-4 hover:border-primary/30 transition-colors">
          <Calendar className="h-5 w-5 text-blue-500 mb-2" />
          <p className="text-sm font-medium">Calendar</p>
          <p className="text-xs text-muted-foreground">Today's events</p>
        </a>
        <a href="/chores" className="rounded-xl border bg-card p-4 hover:border-primary/30 transition-colors">
          <CheckSquare className="h-5 w-5 text-green-500 mb-2" />
          <p className="text-sm font-medium">Chores</p>
          <p className="text-xs text-muted-foreground">What's pending</p>
        </a>
        <a href="/bills" className="rounded-xl border bg-card p-4 hover:border-primary/30 transition-colors">
          <Receipt className="h-5 w-5 text-orange-500 mb-2" />
          <p className="text-sm font-medium">Bills</p>
          <p className="text-xs text-muted-foreground">Due this week</p>
        </a>
      </div>

      {/* Day of week greeting art */}
      <div className="mt-8 rounded-2xl bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border border-yellow-500/20 p-6 text-center">
        <p className="text-4xl mb-2">☀️</p>
        <p className="font-medium">{new Date().toLocaleDateString("en-US", { weekday: "long" })}</p>
        <p className="text-sm text-muted-foreground">Make it a great day!</p>
      </div>
    </div>
  );
}
