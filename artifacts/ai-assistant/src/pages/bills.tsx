import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Receipt, Plus, Trash2, X, Zap, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";

interface Bill { id: number; name: string; amountCents: number; dueDayOfMonth: number; category: string; autoPay: boolean; notes?: string; isActive: boolean; }

const CATEGORIES = ["utility", "subscription", "insurance", "rent", "loan", "phone", "internet", "other"];
const CATEGORY_ICONS: Record<string, string> = { utility: "⚡", subscription: "📺", insurance: "🛡️", rent: "🏠", loan: "🏦", phone: "📱", internet: "🌐", other: "💰" };

export default function BillsPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", amountCents: "", dueDayOfMonth: "", category: "other", autoPay: false, notes: "" });

  const { data: bills = [], isLoading } = useQuery<Bill[]>({ queryKey: ["bills"], queryFn: () => customFetch("/api/bills") });

  const addMutation = useMutation({
    mutationFn: (body: object) => customFetch("/api/bills", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["bills"] }); setShowModal(false); setForm({ name: "", amountCents: "", dueDayOfMonth: "", category: "other", autoPay: false, notes: "" }); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => customFetch(`/api/bills/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bills"] }),
  });

  const today = new Date().getDate();
  const totalMonthly = bills.reduce((sum, b) => sum + b.amountCents, 0);
  const dueSoon = bills.filter(b => b.dueDayOfMonth >= today && b.dueDayOfMonth <= today + 7);

  const sortedBills = [...bills].sort((a, b) => a.dueDayOfMonth - b.dueDayOfMonth);

  return (
    <div className="min-h-screen bg-background p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Receipt className="h-6 w-6 text-primary" /> Bills & Subscriptions</h1>
          <p className="text-muted-foreground text-sm mt-1">${(totalMonthly / 100).toFixed(2)}/mo committed · {dueSoon.length > 0 && <span className="text-yellow-600 font-medium">{dueSoon.length} due this week</span>}</p>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" /> Add Bill
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Monthly Total</p>
          <p className="text-2xl font-bold mt-1">${(totalMonthly / 100).toFixed(2)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Auto-Pay</p>
          <p className="text-2xl font-bold mt-1">{bills.filter(b => b.autoPay).length} bills</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Due This Week</p>
          <p className={cn("text-2xl font-bold mt-1", dueSoon.length > 0 && "text-yellow-600")}>{dueSoon.length} bills</p>
        </div>
      </div>

      {isLoading ? <div className="text-center py-12 text-muted-foreground">Loading...</div> : sortedBills.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Receipt className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p className="font-medium">No bills tracked yet</p>
          <p className="text-sm">Add recurring bills to track your monthly committed spend.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedBills.map(bill => {
            const isDueSoon = bill.dueDayOfMonth >= today && bill.dueDayOfMonth <= today + 7;
            return (
              <div key={bill.id} className={cn("rounded-xl border bg-card p-4 flex items-center gap-4", isDueSoon && "border-yellow-500/50 bg-yellow-500/5")}>
                <span className="text-2xl">{CATEGORY_ICONS[bill.category] ?? "💰"}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{bill.name}</p>
                    {bill.autoPay && <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700 flex items-center gap-1"><Zap className="h-2.5 w-2.5" />Auto</span>}
                    {isDueSoon && <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-700">Due day {bill.dueDayOfMonth}</span>}
                  </div>
                  <p className="text-xs text-muted-foreground capitalize">{bill.category} · Due on the {bill.dueDayOfMonth}{["st","nd","rd"][bill.dueDayOfMonth-1]||"th"}</p>
                </div>
                <p className="font-bold text-lg">${(bill.amountCents / 100).toFixed(2)}</p>
                <button onClick={() => deleteMutation.mutate(bill.id)} className="rounded-lg p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Add Bill</h2>
              <button onClick={() => setShowModal(false)}><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3">
              <input className="w-full rounded-lg border bg-background px-3 py-2 text-sm" placeholder="Bill name (e.g. Netflix, Electric)" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              <div className="grid grid-cols-2 gap-3">
                <input type="number" className="rounded-lg border bg-background px-3 py-2 text-sm" placeholder="Amount (cents)" value={form.amountCents} onChange={e => setForm(f => ({ ...f, amountCents: e.target.value }))} />
                <input type="number" min={1} max={31} className="rounded-lg border bg-background px-3 py-2 text-sm" placeholder="Due day (1-31)" value={form.dueDayOfMonth} onChange={e => setForm(f => ({ ...f, dueDayOfMonth: e.target.value }))} />
              </div>
              <select className="w-full rounded-lg border bg-background px-3 py-2 text-sm" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_ICONS[c]} {c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.autoPay} onChange={e => setForm(f => ({ ...f, autoPay: e.target.checked }))} />
                Auto-pay enabled
              </label>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowModal(false)} className="flex-1 rounded-lg border px-4 py-2 text-sm">Cancel</button>
              <button disabled={!form.name || !form.amountCents || !form.dueDayOfMonth || addMutation.isPending}
                onClick={() => addMutation.mutate({ ...form, amountCents: Math.round(Number(form.amountCents) * 100), dueDayOfMonth: Number(form.dueDayOfMonth) })}
                className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
                {addMutation.isPending ? "Adding..." : "Add Bill"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
