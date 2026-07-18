import { useState, useMemo } from "react";
import { ChefHat, ChevronLeft, ChevronRight, Plus, X, Sparkles, Loader2, Trash2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { useFamilyStatus } from "@/contexts/family-context";

interface MealPlan {
  id: number;
  clerkUserId: string;
  weekStart: string;
  dayOfWeek: number;
  mealSlot: "breakfast" | "lunch" | "dinner";
  dishName: string;
  notes: string | null;
  createdAt: string;
  plannedByName: string;
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SLOTS: MealPlan["mealSlot"][] = ["breakfast", "lunch", "dinner"];
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function getMondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toDateStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export default function MealsPage() {
  const qc = useQueryClient();
  const { isAdmin } = useFamilyStatus();
  const [weekMonday, setWeekMonday] = useState(() => getMondayOf(new Date()));
  const [activeCell, setActiveCell] = useState<{ day: number; slot: MealPlan["mealSlot"] } | null>(null);
  const [formDish, setFormDish] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [aiLoading, setAiLoading] = useState<{ day: number; slot: string } | null>(null);
  const [planningWeek, setPlanningWeek] = useState(false);

  const weekStart = toDateStr(weekMonday);

  const { data: meals = [] } = useQuery<MealPlan[]>({
    queryKey: ["/api/meals", weekStart],
    queryFn: () => customFetch(`${BASE}/api/meals?weekStart=${weekStart}`),
  });

  const mealMap = useMemo(() => {
    const m: Record<string, MealPlan> = {};
    for (const p of meals) m[`${p.dayOfWeek}:${p.mealSlot}`] = p;
    return m;
  }, [meals]);

  const saveMeal = useMutation({
    mutationFn: (body: object) => customFetch(`${BASE}/api/meals`, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/meals", weekStart] }); setActiveCell(null); setFormDish(""); setFormNotes(""); },
  });

  const deleteMeal = useMutation({
    mutationFn: (id: number) => customFetch(`${BASE}/api/meals/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/meals", weekStart] }),
  });

  const clearWeek = useMutation({
    mutationFn: () => customFetch(`${BASE}/api/meals/week?weekStart=${weekStart}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/meals", weekStart] }),
  });

  async function aiSuggest(day: number, slot: MealPlan["mealSlot"]) {
    setAiLoading({ day, slot });
    try {
      const existingMeals = meals.map((m) => m.dishName);
      const res = await customFetch(`${BASE}/api/meals/ai-suggest`, {
        method: "POST",
        body: JSON.stringify({ dayOfWeek: day, mealSlot: slot, existingMeals }),
        headers: { "Content-Type": "application/json" },
      }) as { suggestion: string };
      setFormDish(res.suggestion);
      setActiveCell({ day, slot });
    } finally {
      setAiLoading(null);
    }
  }

  async function planWholeWeek() {
    setPlanningWeek(true);
    try {
      const emptyCells: { day: number; slot: MealPlan["mealSlot"] }[] = [];
      for (let d = 0; d < 7; d++) {
        for (const slot of SLOTS) {
          if (!mealMap[`${d}:${slot}`]) emptyCells.push({ day: d, slot });
        }
      }
      const existingMeals = meals.map((m) => m.dishName);
      for (const cell of emptyCells) {
        const res = await customFetch(`${BASE}/api/meals/ai-suggest`, {
          method: "POST",
          body: JSON.stringify({ dayOfWeek: cell.day, mealSlot: cell.slot, existingMeals }),
          headers: { "Content-Type": "application/json" },
        }) as { suggestion: string };
        await customFetch(`${BASE}/api/meals`, {
          method: "POST",
          body: JSON.stringify({ weekStart, dayOfWeek: cell.day, mealSlot: cell.slot, dishName: res.suggestion }),
          headers: { "Content-Type": "application/json" },
        });
        existingMeals.push(res.suggestion);
      }
      qc.invalidateQueries({ queryKey: ["/api/meals", weekStart] });
    } finally {
      setPlanningWeek(false);
    }
  }

  const weekLabel = `${weekMonday.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${new Date(weekMonday.getTime() + 6 * 86400000).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;

  return (
    <div className="flex flex-col h-full overflow-auto p-6">
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/15">
          <ChefHat className="h-5 w-5 text-orange-400" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Meal Planner</h1>
          <p className="text-sm text-muted-foreground">{weekLabel}</p>
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <button onClick={() => setWeekMonday(getMondayOf(new Date()))} className="text-xs text-muted-foreground px-2 py-1 rounded-lg border border-border/40 hover:bg-accent transition-colors">This week</button>
          <button onClick={() => setWeekMonday(new Date(weekMonday.getTime() - 7 * 86400000))} className="p-2 rounded-lg border border-border/40 hover:bg-accent transition-colors"><ChevronLeft className="h-4 w-4" /></button>
          <button onClick={() => setWeekMonday(new Date(weekMonday.getTime() + 7 * 86400000))} className="p-2 rounded-lg border border-border/40 hover:bg-accent transition-colors"><ChevronRight className="h-4 w-4" /></button>
          <button onClick={planWholeWeek} disabled={planningWeek}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-60 transition-colors">
            {planningWeek ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Plan week with AI
          </button>
          {isAdmin && meals.length > 0 && (
            <button onClick={() => clearWeek.mutate()} className="text-xs text-destructive/70 hover:text-destructive px-2 py-1 rounded-lg border border-destructive/20 hover:border-destructive/40 transition-colors">
              Clear week
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-x-auto">
        <div className="min-w-[700px]">
          {/* Header row */}
          <div className="grid gap-px mb-px" style={{ gridTemplateColumns: "90px repeat(7, 1fr)" }}>
            <div />
            {DAYS_SHORT.map((d, i) => {
              const dayDate = new Date(weekMonday.getTime() + i * 86400000);
              const isToday = toDateStr(dayDate) === toDateStr(new Date());
              return (
                <div key={d} className={cn("text-center text-xs py-2 rounded-t-lg font-medium", isToday ? "text-primary bg-primary/10" : "text-muted-foreground/60")}>
                  {d}
                  <div className={cn("text-[10px] mt-0.5", isToday ? "text-primary" : "text-muted-foreground/40")}>
                    {dayDate.getDate()}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Meal rows */}
          {SLOTS.map((slot) => (
            <div key={slot} className="grid gap-px mb-px" style={{ gridTemplateColumns: "90px repeat(7, 1fr)" }}>
              <div className="flex items-center pr-3">
                <span className="text-xs text-muted-foreground/50 capitalize text-right w-full">{slot}</span>
              </div>
              {Array.from({ length: 7 }, (_, day) => {
                const key = `${day}:${slot}`;
                const meal = mealMap[key];
                const isActive = activeCell?.day === day && activeCell?.slot === slot;
                const isAiLoading = aiLoading?.day === day && aiLoading?.slot === slot;
                return (
                  <div key={day} className="min-h-20 border border-border/20 bg-card/20 rounded-lg overflow-hidden">
                    {meal ? (
                      <div className="p-2 h-full group relative">
                        <p className="text-xs font-medium text-foreground leading-snug">{meal.dishName}</p>
                        {meal.notes && <p className="text-[10px] text-muted-foreground mt-1 leading-snug">{meal.notes}</p>}
                        <p className="text-[10px] text-muted-foreground/40 mt-1">{meal.plannedByName}</p>
                        <button onClick={() => deleteMeal.mutate(meal.id)} className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted-foreground hover:text-destructive transition-all">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : isActive ? (
                      <div className="p-2 space-y-1.5">
                        <input autoFocus value={formDish} onChange={(e) => setFormDish(e.target.value)} placeholder="Dish name…"
                          className="w-full text-xs bg-background border border-border rounded px-2 py-1 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                        <input value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="Notes…"
                          className="w-full text-xs bg-background border border-border rounded px-2 py-1 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                        <div className="flex gap-1">
                          <button onClick={() => formDish.trim() && saveMeal.mutate({ weekStart, dayOfWeek: day, mealSlot: slot, dishName: formDish, notes: formNotes || null })}
                            disabled={!formDish.trim()}
                            className="flex-1 text-[10px] py-1 bg-primary/20 text-primary rounded hover:bg-primary/30 disabled:opacity-50 transition-colors">Save</button>
                          <button onClick={() => { setActiveCell(null); setFormDish(""); setFormNotes(""); }}
                            className="px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground rounded transition-colors">✕</button>
                        </div>
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center gap-1.5 p-2">
                        <button onClick={() => { setActiveCell({ day, slot }); setFormDish(""); setFormNotes(""); }}
                          className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/20 transition-colors">
                          <Plus className="h-4 w-4" />
                        </button>
                        <button onClick={() => aiSuggest(day, slot)} disabled={isAiLoading}
                          className="flex items-center gap-1 text-[10px] text-muted-foreground/40 hover:text-primary transition-colors disabled:opacity-30">
                          {isAiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                          Ask AI
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
