import { useState } from "react";
import { CalendarIcon, Plus, X, ChevronLeft, ChevronRight } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

interface FamilyEvent {
  id: number;
  clerkUserId: string;
  title: string;
  startAt: string;
  endAt: string | null;
  notes: string | null;
  color: string;
  createdAt: string;
  creatorName: string;
  creatorAvatarUrl: string | null;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const MEMBER_COLORS = ["#6366f1", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];

function toLocalDateStr(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function CalendarPage() {
  const qc = useQueryClient();
  const [viewDate, setViewDate] = useState(new Date());
  const [showForm, setShowForm] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<FamilyEvent | null>(null);
  const [form, setForm] = useState({ title: "", startAt: "", endAt: "", notes: "", color: MEMBER_COLORS[0] });

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth() + 1;

  const { data: events = [] } = useQuery<FamilyEvent[]>({
    queryKey: ["/api/calendar", year, month],
    queryFn: () => customFetch(`${BASE}/api/calendar?year=${year}&month=${month}`),
  });

  const createMutation = useMutation({
    mutationFn: (body: object) => customFetch(`${BASE}/api/calendar`, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/calendar"] }); setShowForm(false); setForm({ title: "", startAt: "", endAt: "", notes: "", color: MEMBER_COLORS[0] }); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => customFetch(`${BASE}/api/calendar/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/calendar"] }); setSelectedEvent(null); },
  });

  // Build grid
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const startPad = (firstDay.getDay() + 6) % 7; // Mon = 0
  const cells: (Date | null)[] = [...Array(startPad).fill(null)];
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(new Date(year, month - 1, d));

  const eventsForDay = (d: Date) =>
    events.filter((e) => {
      const eDate = new Date(e.startAt);
      return eDate.getFullYear() === d.getFullYear() && eDate.getMonth() === d.getMonth() && eDate.getDate() === d.getDate();
    });

  const today = new Date();
  const isToday = (d: Date) => toLocalDateStr(d) === toLocalDateStr(today);

  function openAddForDay(d: Date) {
    const iso = `${toLocalDateStr(d)}T09:00`;
    setForm((f) => ({ ...f, startAt: iso, endAt: "" }));
    setSelectedDay(d);
    setShowForm(true);
  }

  return (
    <div className="flex flex-col h-full overflow-auto p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15">
          <CalendarIcon className="h-5 w-5 text-violet-400" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Family Calendar</h1>
          <p className="text-sm text-muted-foreground">{events.length} events this month</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setViewDate(new Date(year, month - 2))} className="p-2 rounded-lg border border-border/40 hover:bg-accent transition-colors"><ChevronLeft className="h-4 w-4" /></button>
          <span className="text-sm font-medium min-w-28 text-center">{firstDay.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
          <button onClick={() => setViewDate(new Date(year, month))} className="p-2 rounded-lg border border-border/40 hover:bg-accent transition-colors"><ChevronRight className="h-4 w-4" /></button>
          <button onClick={() => { setSelectedDay(null); setShowForm(!showForm); }} className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors ml-2">
            {showForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {showForm ? "Cancel" : "Add event"}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="mb-6 p-4 rounded-xl border border-border/50 bg-card/50 space-y-3">
          <input autoFocus value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Event title…"
            className="w-full bg-background/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
          <div className="flex gap-2 flex-wrap">
            <div className="flex flex-col gap-1 flex-1 min-w-40">
              <label className="text-xs text-muted-foreground">Start</label>
              <input type="datetime-local" value={form.startAt} onChange={(e) => setForm((f) => ({ ...f, startAt: e.target.value }))}
                className="bg-background/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div className="flex flex-col gap-1 flex-1 min-w-40">
              <label className="text-xs text-muted-foreground">End (optional)</label>
              <input type="datetime-local" value={form.endAt} onChange={(e) => setForm((f) => ({ ...f, endAt: e.target.value }))}
                className="bg-background/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
          </div>
          <div className="flex gap-2 items-start">
            <input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Notes (optional)"
              className="flex-1 bg-background/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
            <div className="flex gap-1.5 flex-wrap max-w-40">
              {MEMBER_COLORS.map((c) => (
                <button key={c} onClick={() => setForm((f) => ({ ...f, color: c }))}
                  className={cn("h-6 w-6 rounded-full border-2 transition-all", form.color === c ? "border-white scale-110" : "border-transparent")}
                  style={{ background: c }} />
              ))}
            </div>
            <button onClick={() => form.title.trim() && form.startAt && createMutation.mutate({ ...form, endAt: form.endAt || null, notes: form.notes || null })}
              disabled={!form.title.trim() || !form.startAt || createMutation.isPending}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
              Save
            </button>
          </div>
        </div>
      )}

      {/* Calendar grid */}
      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-7 gap-px bg-border/20 rounded-xl overflow-hidden border border-border/20">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="bg-card/30 px-2 py-2 text-center text-xs font-medium text-muted-foreground/60">{d}</div>
          ))}
          {cells.map((day, i) => (
            <div key={i} onClick={() => day && openAddForDay(day)}
              className={cn("bg-card/20 min-h-20 p-2 cursor-pointer hover:bg-card/40 transition-colors", !day && "cursor-default bg-muted/5 hover:bg-muted/5")}>
              {day && (
                <>
                  <span className={cn("inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium mb-1",
                    isToday(day) ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
                    {day.getDate()}
                  </span>
                  <div className="space-y-0.5">
                    {eventsForDay(day).slice(0, 3).map((e) => (
                      <div key={e.id} onClick={(ev) => { ev.stopPropagation(); setSelectedEvent(e); }}
                        className="text-[10px] truncate px-1.5 py-0.5 rounded text-white cursor-pointer hover:opacity-80 transition-opacity"
                        style={{ background: e.color + "cc" }}>
                        {e.title}
                      </div>
                    ))}
                    {eventsForDay(day).length > 3 && (
                      <div className="text-[10px] text-muted-foreground px-1">+{eventsForDay(day).length - 3} more</div>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Event detail drawer */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/60 backdrop-blur-sm" onClick={() => setSelectedEvent(null)}>
          <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="h-4 w-4 rounded-full shrink-0" style={{ background: selectedEvent.color }} />
                <h3 className="text-lg font-semibold text-foreground">{selectedEvent.title}</h3>
              </div>
              <button onClick={() => setSelectedEvent(null)} className="p-1 rounded text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p><span className="text-foreground font-medium">Start:</span> {new Date(selectedEvent.startAt).toLocaleString()}</p>
              {selectedEvent.endAt && <p><span className="text-foreground font-medium">End:</span> {new Date(selectedEvent.endAt).toLocaleString()}</p>}
              {selectedEvent.notes && <p><span className="text-foreground font-medium">Notes:</span> {selectedEvent.notes}</p>}
              <p><span className="text-foreground font-medium">By:</span> {selectedEvent.creatorName}</p>
            </div>
            <button onClick={() => deleteMutation.mutate(selectedEvent.id)} className="mt-4 text-xs text-destructive hover:underline">Delete event</button>
          </div>
        </div>
      )}
    </div>
  );
}
