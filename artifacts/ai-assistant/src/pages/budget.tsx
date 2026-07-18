import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Plus, Trash2, TrendingUp, TrendingDown, DollarSign, X } from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface BudgetEntry {
  id: number;
  clerkUserId: string;
  type: "income" | "expense";
  amount: string;
  category: string;
  description: string;
  entryDate: string;
  memberName: string;
  memberAvatarUrl: string | null;
}
interface Summary { month: string; totalIncome: number; totalExpenses: number; net: number; entryCount: number }

const CATEGORIES = ["Groceries", "Food", "Utilities", "Transport", "Health", "Education", "Entertainment", "Income", "Other"];

function fmt(n: number) { return n.toLocaleString("en-US", { style: "currency", currency: "USD" }); }
function currentMonth() { return new Date().toISOString().slice(0, 7); }

export default function BudgetPage() {
  const qc = useQueryClient();
  const [month, setMonth] = useState(currentMonth());
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ type: "expense" as "income" | "expense", amount: "", category: "Food", description: "", entryDate: new Date().toISOString().slice(0, 10) });

  const entriesKey = ["/api/budget/entries", month];
  const summaryKey = ["/api/budget/summary", month];

  const { data: entries = [], isLoading } = useQuery<BudgetEntry[]>({
    queryKey: entriesKey,
    queryFn: () => customFetch(`${BASE}/api/budget/entries?month=${month}`),
  });
  const { data: summary } = useQuery<Summary>({
    queryKey: summaryKey,
    queryFn: () => customFetch(`${BASE}/api/budget/summary?month=${month}`),
  });

  const addMutation = useMutation({
    mutationFn: (data: typeof form) => customFetch(`${BASE}/api/budget/entries`, { method: "POST", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/budget/entries"] }); qc.invalidateQueries({ queryKey: ["/api/budget/summary"] }); setShowModal(false); },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => customFetch(`${BASE}/api/budget/entries/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/budget/entries"] }); qc.invalidateQueries({ queryKey: ["/api/budget/summary"] }); },
  });

  const net = summary?.net ?? 0;

  return (
    <div className="flex flex-col h-full overflow-auto p-6 gap-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Budget Tracker</h1>
          <p className="text-sm text-muted-foreground">Track family income and expenses</p>
        </div>
        <div className="flex items-center gap-3">
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
            className="bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground" />
          <button onClick={() => setShowModal(true)} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <Plus className="h-4 w-4" /> Add Entry
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Income", value: summary?.totalIncome ?? 0, icon: TrendingUp, color: "text-emerald-400", bg: "bg-emerald-400/10" },
          { label: "Expenses", value: summary?.totalExpenses ?? 0, icon: TrendingDown, color: "text-red-400", bg: "bg-red-400/10" },
          { label: "Net Balance", value: net, icon: DollarSign, color: net >= 0 ? "text-blue-400" : "text-red-400", bg: net >= 0 ? "bg-blue-400/10" : "bg-red-400/10" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-card border border-border rounded-xl p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className={cn("rounded-lg p-1.5", bg)}><Icon className={cn("h-4 w-4", color)} /></div>
              <span className="text-xs font-medium text-muted-foreground">{label}</span>
            </div>
            <p className={cn("text-xl font-bold", color)}>{fmt(value)}</p>
          </div>
        ))}
      </div>

      {/* Entries table */}
      {isLoading ? (
        <div className="flex justify-center py-12"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
          <div className="text-5xl">💰</div>
          <p>No entries for {month}. Add your first income or expense!</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-accent/20">
              <tr>
                {["Date", "Description", "Category", "Member", "Amount", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entries.map((e) => (
                <tr key={e.id} className="hover:bg-accent/10 transition-colors">
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{e.entryDate}</td>
                  <td className="px-4 py-3 text-foreground">{e.description || "—"}</td>
                  <td className="px-4 py-3">
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">{e.category}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {e.memberAvatarUrl
                        ? <img src={e.memberAvatarUrl} className="h-5 w-5 rounded-full" alt="" />
                        : <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center text-[9px] font-bold text-primary">{e.memberName[0]}</div>
                      }
                      <span className="text-muted-foreground">{e.memberName}</span>
                    </div>
                  </td>
                  <td className={cn("px-4 py-3 font-semibold whitespace-nowrap", e.type === "income" ? "text-emerald-400" : "text-red-400")}>
                    {e.type === "income" ? "+" : "−"}{fmt(parseFloat(e.amount))}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => deleteMutation.mutate(e.id)} className="p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-red-400/10">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-foreground">Add Entry</h2>
              <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(["expense", "income"] as const).map((t) => (
                <button key={t} onClick={() => setForm((f) => ({ ...f, type: t }))}
                  className={cn("py-2 rounded-lg text-sm font-medium border transition-colors", form.type === t ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent")}>
                  {t === "income" ? "💰 Income" : "💸 Expense"}
                </button>
              ))}
            </div>
            <input type="number" min="0" step="0.01" placeholder="Amount"
              className="bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground w-full placeholder:text-muted-foreground"
              value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
            <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              className="bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground w-full">
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <input placeholder="Description (optional)"
              className="bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground w-full placeholder:text-muted-foreground"
              value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            <input type="date" value={form.entryDate} onChange={(e) => setForm((f) => ({ ...f, entryDate: e.target.value }))}
              className="bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground w-full" />
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:bg-accent">Cancel</button>
              <button onClick={() => addMutation.mutate(form)} disabled={!form.amount || addMutation.isPending}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
