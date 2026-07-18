import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Package, Plus, Trash2, X, AlertCircle, ShieldCheck, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

interface InventoryItem { id: number; name: string; category: string; brand?: string; model?: string; serialNumber?: string; purchasedAt?: string; purchasePriceCents?: number; warrantyExpiry?: string; location?: string; notes?: string; }

const CATEGORIES = ["appliance", "electronics", "furniture", "valuables", "tools", "vehicle", "other"];
const CATEGORY_ICONS: Record<string, string> = { appliance: "🏠", electronics: "💻", furniture: "🪑", valuables: "💎", tools: "🔧", vehicle: "🚗", other: "📦" };

function warrantyStatus(item: InventoryItem) {
  if (!item.warrantyExpiry) return "none";
  const days = Math.ceil((new Date(item.warrantyExpiry).getTime() - Date.now()) / 86400000);
  if (days < 0) return "expired";
  if (days <= 30) return "expiring";
  return "active";
}

export default function InventoryPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [filter, setFilter] = useState("all");
  const [form, setForm] = useState({ name: "", category: "appliance", brand: "", model: "", serialNumber: "", purchasedAt: "", purchasePriceCents: "", warrantyExpiry: "", location: "", notes: "" });

  const { data: items = [], isLoading } = useQuery<InventoryItem[]>({ queryKey: ["inventory"], queryFn: () => customFetch("/api/inventory") });

  const addMutation = useMutation({
    mutationFn: (body: object) => customFetch("/api/inventory", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["inventory"] }); setShowModal(false); setForm({ name: "", category: "appliance", brand: "", model: "", serialNumber: "", purchasedAt: "", purchasePriceCents: "", warrantyExpiry: "", location: "", notes: "" }); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => customFetch(`/api/inventory/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory"] }),
  });

  const filtered = filter === "all" ? items : items.filter(i => i.category === filter);
  const expiredCount = items.filter(i => warrantyStatus(i) === "expired").length;

  return (
    <div className="min-h-screen bg-background p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Package className="h-6 w-6 text-primary" /> Home Inventory</h1>
          <p className="text-muted-foreground text-sm mt-1">{items.length} items tracked{expiredCount > 0 && <span className="text-red-500 font-medium"> · {expiredCount} warranties expired</span>}</p>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" /> Add Item
        </button>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {["all", ...CATEGORIES].map(cat => (
          <button key={cat} onClick={() => setFilter(cat)} className={cn("rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors", filter === cat ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80")}>
            {cat === "all" ? "All" : `${CATEGORY_ICONS[cat]} ${cat.charAt(0).toUpperCase() + cat.slice(1)}`}
          </button>
        ))}
      </div>

      {isLoading ? <div className="text-center py-12 text-muted-foreground">Loading...</div> : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><Package className="h-12 w-12 mx-auto mb-3 opacity-20" /><p className="font-medium">No items yet</p></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(item => {
            const ws = warrantyStatus(item);
            return (
              <div key={item.id} className="rounded-xl border bg-card p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-2xl">{CATEGORY_ICONS[item.category] ?? "📦"}</span>
                    <p className="font-medium mt-1">{item.name}</p>
                    {item.brand && <p className="text-xs text-muted-foreground">{item.brand}{item.model && ` · ${item.model}`}</p>}
                  </div>
                  <div className={cn("rounded-full p-1.5", ws === "active" ? "bg-green-100 text-green-600" : ws === "expiring" ? "bg-yellow-100 text-yellow-600" : ws === "expired" ? "bg-red-100 text-red-600" : "bg-muted text-muted-foreground")}>
                    {ws === "active" ? <ShieldCheck className="h-3.5 w-3.5" /> : ws === "expired" ? <AlertCircle className="h-3.5 w-3.5" /> : <Shield className="h-3.5 w-3.5" />}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  {item.location && <p>📍 {item.location}</p>}
                  {item.purchasedAt && <p>🗓 Bought {new Date(item.purchasedAt).toLocaleDateString()}</p>}
                  {item.purchasePriceCents && <p>💲 ${(item.purchasePriceCents / 100).toFixed(2)}</p>}
                  {item.warrantyExpiry && <p className={cn(ws === "expired" ? "text-red-500" : ws === "expiring" ? "text-yellow-600" : "")}>🛡 Warranty {ws === "expired" ? "expired" : "until"} {new Date(item.warrantyExpiry).toLocaleDateString()}</p>}
                  {item.serialNumber && <p>🔢 {item.serialNumber}</p>}
                </div>
                <button onClick={() => deleteMutation.mutate(item.id)} className="self-end rounded-lg p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-2xl my-4">
            <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-semibold">Add Item</h2><button onClick={() => setShowModal(false)}><X className="h-5 w-5" /></button></div>
            <div className="space-y-3">
              <input className="w-full rounded-lg border bg-background px-3 py-2 text-sm" placeholder="Item name *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              <select className="w-full rounded-lg border bg-background px-3 py-2 text-sm" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_ICONS[c]} {c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <input className="rounded-lg border bg-background px-3 py-2 text-sm" placeholder="Brand" value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} />
                <input className="rounded-lg border bg-background px-3 py-2 text-sm" placeholder="Model" value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} />
              </div>
              <input className="w-full rounded-lg border bg-background px-3 py-2 text-sm" placeholder="Serial number" value={form.serialNumber} onChange={e => setForm(f => ({ ...f, serialNumber: e.target.value }))} />
              <input className="w-full rounded-lg border bg-background px-3 py-2 text-sm" placeholder="Location (e.g. Kitchen, Garage)" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-muted-foreground">Purchase date</label><input type="date" className="w-full rounded-lg border bg-background px-3 py-2 text-sm" value={form.purchasedAt} onChange={e => setForm(f => ({ ...f, purchasedAt: e.target.value }))} /></div>
                <div><label className="text-xs text-muted-foreground">Warranty expiry</label><input type="date" className="w-full rounded-lg border bg-background px-3 py-2 text-sm" value={form.warrantyExpiry} onChange={e => setForm(f => ({ ...f, warrantyExpiry: e.target.value }))} /></div>
              </div>
              <input type="number" className="w-full rounded-lg border bg-background px-3 py-2 text-sm" placeholder="Purchase price (e.g. 499.99)" value={form.purchasePriceCents} onChange={e => setForm(f => ({ ...f, purchasePriceCents: e.target.value }))} />
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowModal(false)} className="flex-1 rounded-lg border px-4 py-2 text-sm">Cancel</button>
              <button disabled={!form.name || addMutation.isPending} onClick={() => addMutation.mutate({ ...form, purchasePriceCents: form.purchasePriceCents ? Math.round(Number(form.purchasePriceCents) * 100) : undefined })} className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
                {addMutation.isPending ? "Adding..." : "Add Item"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
