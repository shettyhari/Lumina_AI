import { useState } from "react";
import { CheckSquare, Plus, X, AlertCircle, Calendar, User } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useListFamilyMembers } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

interface Chore {
  id: number;
  assignedToClerkUserId: string | null;
  createdByClerkUserId: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  priority: "low" | "medium" | "high";
  status: "todo" | "in_progress" | "done";
  createdAt: string;
  assignedToName: string | null;
  assignedToAvatarUrl: string | null;
  createdByName: string;
}

const COLUMNS: { key: Chore["status"]; label: string; color: string }[] = [
  { key: "todo", label: "To Do", color: "text-muted-foreground" },
  { key: "in_progress", label: "In Progress", color: "text-yellow-400" },
  { key: "done", label: "Done", color: "text-green-400" },
];

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-blue-500/15 text-blue-400",
  medium: "bg-yellow-500/15 text-yellow-400",
  high: "bg-red-500/15 text-red-400",
};

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function isOverdue(dueDate: string | null, status: string) {
  if (!dueDate || status === "done") return false;
  return new Date(dueDate) < new Date(new Date().toDateString());
}

export default function ChoresPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", assignedToClerkUserId: "", dueDate: "", priority: "medium" });

  const { data: chores = [], isLoading } = useQuery<Chore[]>({
    queryKey: ["/api/chores"],
    queryFn: () => customFetch(`${BASE}/api/chores`),
  });

  const { data: members = [] } = useListFamilyMembers({ query: { queryKey: ["/api/family/members"] } });

  const createMutation = useMutation({
    mutationFn: (body: object) => customFetch(`${BASE}/api/chores`, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/chores"] }); setShowForm(false); setForm({ title: "", description: "", assignedToClerkUserId: "", dueDate: "", priority: "medium" }); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: { id: number } & Record<string, unknown>) =>
      customFetch(`${BASE}/api/chores/${id}`, { method: "PATCH", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/chores"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => customFetch(`${BASE}/api/chores/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/chores"] }),
  });

  const columns = COLUMNS.map((col) => ({
    ...col,
    chores: chores.filter((c) => c.status === col.key),
  }));

  return (
    <div className="flex flex-col h-full overflow-hidden p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/15">
          <CheckSquare className="h-5 w-5 text-blue-400" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Chores</h1>
          <p className="text-sm text-muted-foreground">{chores.filter((c) => c.status !== "done").length} active chores</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="ml-auto flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
          {showForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {showForm ? "Cancel" : "New chore"}
        </button>
      </div>

      {showForm && (
        <div className="mb-6 p-4 rounded-xl border border-border/50 bg-card/50 space-y-3">
          <input
            autoFocus value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Chore title…"
            className="w-full bg-background/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <input
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Description (optional)"
            className="w-full bg-background/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="flex gap-2 flex-wrap">
            <select value={form.assignedToClerkUserId} onChange={(e) => setForm((f) => ({ ...f, assignedToClerkUserId: e.target.value }))}
              className="flex-1 min-w-32 bg-background/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
              <option value="">Unassigned</option>
              {members.map((m) => <option key={m.clerkUserId} value={m.clerkUserId}>{m.displayName ?? m.email}</option>)}
            </select>
            <input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
              className="bg-background/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
            <select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
              className="bg-background/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
            <button
              onClick={() => form.title.trim() && createMutation.mutate({ ...form, assignedToClerkUserId: form.assignedToClerkUserId || null, dueDate: form.dueDate || null })}
              disabled={!form.title.trim() || createMutation.isPending}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >Create</button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto">
          <div className="flex gap-4 h-full min-w-0" style={{ minWidth: "600px" }}>
            {columns.map((col) => (
              <div key={col.key} className="flex-1 flex flex-col min-w-0">
                <div className="flex items-center gap-2 mb-3">
                  <h3 className={cn("text-sm font-medium", col.color)}>{col.label}</h3>
                  <span className="text-xs text-muted-foreground/60 bg-muted/20 px-2 py-0.5 rounded-full">{col.chores.length}</span>
                </div>
                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {col.chores.length === 0 ? (
                    <div className="text-xs text-muted-foreground/40 text-center py-8 border border-dashed border-border/20 rounded-xl">No chores</div>
                  ) : (
                    col.chores.map((chore) => (
                      <ChoreCard key={chore.id} chore={chore}
                        onStatusChange={(status) => updateMutation.mutate({ id: chore.id, status })}
                        onDelete={() => deleteMutation.mutate(chore.id)}
                      />
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ChoreCard({ chore, onStatusChange, onDelete }: { chore: Chore; onStatusChange: (s: Chore["status"]) => void; onDelete: () => void }) {
  const overdue = isOverdue(chore.dueDate, chore.status);
  return (
    <div className={cn("p-3 rounded-xl border bg-card/40 space-y-2 group", overdue ? "border-red-500/40" : "border-border/40")}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-foreground leading-snug">{chore.title}</p>
        <button onClick={onDelete} className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-destructive transition-all shrink-0">
          <X className="h-3 w-3" />
        </button>
      </div>
      {chore.description && <p className="text-xs text-muted-foreground">{chore.description}</p>}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full", PRIORITY_COLORS[chore.priority])}>{chore.priority}</span>
        {chore.dueDate && (
          <span className={cn("flex items-center gap-1 text-[10px]", overdue ? "text-red-400" : "text-muted-foreground")}>
            {overdue && <AlertCircle className="h-3 w-3" />}
            <Calendar className="h-3 w-3" />
            {new Date(chore.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </span>
        )}
        {chore.assignedToName && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground ml-auto">
            {chore.assignedToAvatarUrl
              ? <img src={chore.assignedToAvatarUrl} className="h-4 w-4 rounded-full" alt={chore.assignedToName} />
              : <User className="h-3 w-3" />}
            {chore.assignedToName}
          </span>
        )}
      </div>
      <select
        value={chore.status}
        onChange={(e) => onStatusChange(e.target.value as Chore["status"])}
        className="w-full text-xs bg-background/50 border border-border/50 rounded-lg px-2 py-1 text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
      >
        <option value="todo">To Do</option>
        <option value="in_progress">In Progress</option>
        <option value="done">Done</option>
      </select>
    </div>
  );
}
