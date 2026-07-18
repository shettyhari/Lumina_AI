import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Wrench, Plus, CheckCircle2, Clock, AlertTriangle, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface MaintenanceTask {
  id: number; title: string; description?: string; category: string;
  intervalDays?: number; lastDoneAt?: string; nextDueAt?: string; createdAt: string;
}

const CATEGORIES = ["general", "hvac", "plumbing", "electrical", "appliance", "garden", "exterior", "safety"];

function getDueStatus(task: MaintenanceTask) {
  if (!task.nextDueAt) return "none";
  const daysUntil = Math.ceil((new Date(task.nextDueAt).getTime() - Date.now()) / 86400000);
  if (daysUntil < 0) return "overdue";
  if (daysUntil <= 7) return "soon";
  return "ok";
}

export default function MaintenancePage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", category: "general", intervalDays: "" });

  const { data: tasks = [], isLoading } = useQuery<MaintenanceTask[]>({
    queryKey: ["maintenance"],
    queryFn: () => customFetch("/api/maintenance"),
  });

  const addMutation = useMutation({
    mutationFn: (body: object) => customFetch("/api/maintenance", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["maintenance"] }); setShowModal(false); setForm({ title: "", description: "", category: "general", intervalDays: "" }); },
  });

  const doneMutation = useMutation({
    mutationFn: (id: number) => customFetch(`/api/maintenance/${id}/done`, { method: "PATCH", headers: { "Content-Type": "application/json" } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["maintenance"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => customFetch(`/api/maintenance/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["maintenance"] }),
  });

  const overdueCount = tasks.filter(t => getDueStatus(t) === "overdue").length;
  const soonCount = tasks.filter(t => getDueStatus(t) === "soon").length;

  return (
    <div className="min-h-screen bg-background p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Wrench className="h-6 w-6 text-primary" /> Home Maintenance</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {overdueCount > 0 && <span className="text-red-500 font-medium">{overdueCount} overdue · </span>}
            {soonCount > 0 && <span className="text-yellow-500 font-medium">{soonCount} due soon · </span>}
            {tasks.length} total tasks
          </p>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" /> Add Task
        </button>
      </div>

      {isLoading ? (
        <div className="text-center text-muted-foreground py-12">Loading tasks...</div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Wrench className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p className="font-medium">No maintenance tasks yet</p>
          <p className="text-sm">Add tasks like HVAC filter changes, roof inspections, and appliance servicing.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map(task => {
            const status = getDueStatus(task);
            return (
              <div key={task.id} className={cn("rounded-xl border p-4 flex items-center gap-4 bg-card",
                status === "overdue" && "border-red-500/50 bg-red-500/5",
                status === "soon" && "border-yellow-500/50 bg-yellow-500/5",
              )}>
                <div className={cn("rounded-full p-2",
                  status === "overdue" ? "bg-red-100 text-red-600" :
                  status === "soon" ? "bg-yellow-100 text-yellow-600" : "bg-muted text-muted-foreground"
                )}>
                  {status === "overdue" ? <AlertTriangle className="h-4 w-4" /> :
                   status === "soon" ? <Clock className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{task.title}</p>
                  <p className="text-xs text-muted-foreground">
                    <span className="capitalize">{task.category}</span>
                    {task.intervalDays && ` · Every ${task.intervalDays} days`}
                    {task.lastDoneAt && ` · Last done ${new Date(task.lastDoneAt).toLocaleDateString()}`}
                    {task.nextDueAt && ` · Due ${new Date(task.nextDueAt).toLocaleDateString()}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => doneMutation.mutate(task.id)} className="rounded-lg bg-green-500/10 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-500/20">
                    ✓ Done
                  </button>
                  <button onClick={() => deleteMutation.mutate(task.id)} className="rounded-lg p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Add Maintenance Task</h2>
              <button onClick={() => setShowModal(false)}><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3">
              <input className="w-full rounded-lg border bg-background px-3 py-2 text-sm" placeholder="Task title (e.g. Replace HVAC filter)" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              <input className="w-full rounded-lg border bg-background px-3 py-2 text-sm" placeholder="Description (optional)" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              <select className="w-full rounded-lg border bg-background px-3 py-2 text-sm" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                {CATEGORIES.map(c => <option key={c} value={c} className="capitalize">{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
              <input type="number" className="w-full rounded-lg border bg-background px-3 py-2 text-sm" placeholder="Repeat every N days (optional)" value={form.intervalDays} onChange={e => setForm(f => ({ ...f, intervalDays: e.target.value }))} />
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowModal(false)} className="flex-1 rounded-lg border px-4 py-2 text-sm">Cancel</button>
              <button disabled={!form.title || addMutation.isPending} onClick={() => addMutation.mutate({ ...form, intervalDays: form.intervalDays ? Number(form.intervalDays) : undefined })} className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
                {addMutation.isPending ? "Adding..." : "Add Task"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
