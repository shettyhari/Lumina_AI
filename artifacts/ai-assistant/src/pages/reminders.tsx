import { useState, useEffect } from "react";
import { Bell, Plus, X, Clock, RotateCcw } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

interface Reminder {
  id: number;
  clerkUserId: string;
  message: string;
  remindAt: string;
  repeat: "none" | "daily" | "weekly";
  isTriggered: boolean;
  createdAt: string;
}

interface ReminderToast { id: number; message: string }

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function toLocalDatetimeStr(d: Date) {
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

export default function RemindersPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ message: "", remindAt: toLocalDatetimeStr(new Date(Date.now() + 60 * 60 * 1000)), repeat: "none" });
  const [toasts, setToasts] = useState<ReminderToast[]>([]);

  const { data: remindersList = [] } = useQuery<Reminder[]>({
    queryKey: ["/api/reminders"],
    queryFn: () => customFetch(`${BASE}/api/reminders`),
  });

  // Poll for due reminders every 10 minutes
  useQuery<Reminder[]>({
    queryKey: ["/api/reminders/due"],
    queryFn: async () => {
      const due = await customFetch(`${BASE}/api/reminders/due`) as Reminder[];
      if (due.length > 0) {
        setToasts((prev) => [...prev, ...due.map((r) => ({ id: r.id, message: r.message }))]);
        qc.invalidateQueries({ queryKey: ["/api/reminders"] });
      }
      return due;
    },
    refetchInterval: 10 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: (body: object) => customFetch(`${BASE}/api/reminders`, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/reminders"] }); setShowForm(false); setForm({ message: "", remindAt: toLocalDatetimeStr(new Date(Date.now() + 60 * 60 * 1000)), repeat: "none" }); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => customFetch(`${BASE}/api/reminders/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/reminders"] }),
  });

  const upcoming = remindersList.filter((r) => !r.isTriggered).sort((a, b) => new Date(a.remindAt).getTime() - new Date(b.remindAt).getTime());
  const triggered = remindersList.filter((r) => r.isTriggered);

  const dismissToast = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <div className="flex flex-col h-full overflow-auto p-6 max-w-2xl mx-auto relative">
      {/* Toast notifications */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto flex items-start gap-3 bg-card border border-primary/30 rounded-xl p-4 shadow-2xl max-w-sm animate-in slide-in-from-right-4">
            <Bell className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-xs font-medium text-primary mb-0.5">Reminder</p>
              <p className="text-sm text-foreground">{toast.message}</p>
            </div>
            <button onClick={() => dismissToast(toast.id)} className="p-1 rounded text-muted-foreground hover:text-foreground shrink-0"><X className="h-3.5 w-3.5" /></button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15">
          <Bell className="h-5 w-5 text-amber-400" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Reminders</h1>
          <p className="text-sm text-muted-foreground">{upcoming.length} upcoming</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="ml-auto flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
          {showForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {showForm ? "Cancel" : "New reminder"}
        </button>
      </div>

      {showForm && (
        <div className="mb-6 p-4 rounded-xl border border-border/50 bg-card/50 space-y-3">
          <input autoFocus value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} placeholder="Reminder message…"
            className="w-full bg-background/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
          <div className="flex gap-2 flex-wrap">
            <input type="datetime-local" value={form.remindAt} onChange={(e) => setForm((f) => ({ ...f, remindAt: e.target.value }))}
              className="flex-1 bg-background/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
            <select value={form.repeat} onChange={(e) => setForm((f) => ({ ...f, repeat: e.target.value }))}
              className="bg-background/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
              <option value="none">Once</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
            <button onClick={() => form.message.trim() && form.remindAt && createMutation.mutate({ message: form.message, remindAt: new Date(form.remindAt).toISOString(), repeat: form.repeat })}
              disabled={!form.message.trim() || !form.remindAt || createMutation.isPending}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
              Save
            </button>
          </div>
        </div>
      )}

      {upcoming.length === 0 && triggered.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 text-muted-foreground py-16">
          <Bell className="h-12 w-12 opacity-20" />
          <p className="text-sm">No reminders yet.<br />Create one above or ask Lumina in chat.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {upcoming.map((r) => {
            const isNow = new Date(r.remindAt) <= new Date();
            return (
              <div key={r.id} className={cn("flex items-start gap-3 px-4 py-3 rounded-xl border transition-colors group", isNow ? "border-primary/30 bg-primary/5" : "border-border/40 bg-card/30")}>
                <Clock className={cn("h-4 w-4 mt-0.5 shrink-0", isNow ? "text-primary" : "text-muted-foreground")} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground">{r.message}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(r.remindAt).toLocaleString()}
                    {r.repeat !== "none" && <span className="ml-2 text-primary/70 flex items-center inline-flex gap-1"><RotateCcw className="h-3 w-3" /> {r.repeat}</span>}
                  </p>
                </div>
                <button onClick={() => deleteMutation.mutate(r.id)} className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-destructive transition-all shrink-0">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}

          {triggered.length > 0 && (
            <details className="mt-4">
              <summary className="text-xs text-muted-foreground/50 cursor-pointer hover:text-muted-foreground transition-colors uppercase tracking-wider py-2">
                Triggered ({triggered.length})
              </summary>
              <div className="space-y-1.5 mt-2 opacity-40">
                {triggered.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-border/20 bg-muted/10 group">
                    <Bell className="h-4 w-4 text-muted-foreground shrink-0" />
                    <p className="flex-1 text-sm text-muted-foreground line-through">{r.message}</p>
                    <button onClick={() => deleteMutation.mutate(r.id)} className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-destructive transition-all">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
