import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { ShoppingBasket, Plus, X, Trash2, Sparkles, ChefHat } from "lucide-react";
import { cn } from "@/lib/utils";

interface PantryItem { id: number; name: string; quantity?: string; category: string; expiresAt?: string; addedAt: string; }
interface MealSuggestion { name: string; description: string; uses: string[]; cookTime: string; emoji: string; }

const CATEGORIES = ["produce", "dairy", "meat", "pantry", "frozen", "bakery", "beverage", "spice", "other"];
const CATEGORY_ICONS: Record<string, string> = { produce: "🥬", dairy: "🥛", meat: "🥩", pantry: "🥫", frozen: "🧊", bakery: "🍞", beverage: "🧃", spice: "🫙", other: "📦" };

function expiryStatus(item: PantryItem) {
  if (!item.expiresAt) return "none";
  const days = Math.ceil((new Date(item.expiresAt).getTime() - Date.now()) / 86400000);
  if (days < 0) return "expired";
  if (days <= 3) return "soon";
  return "ok";
}

export default function PantryPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [suggestions, setSuggestions] = useState<MealSuggestion[] | null>(null);
  const [form, setForm] = useState({ name: "", quantity: "", category: "pantry", expiresAt: "" });

  const { data: items = [] } = useQuery<PantryItem[]>({ queryKey: ["pantry"], queryFn: () => customFetch("/api/pantry") });

  const addMutation = useMutation({
    mutationFn: (body: object) => customFetch("/api/pantry", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pantry"] }); setShowAdd(false); setForm({ name: "", quantity: "", category: "pantry", expiresAt: "" }); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => customFetch(`/api/pantry/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pantry"] }),
  });

  const [suggesting, setSuggesting] = useState(false);
  async function getSuggestions() {
    setSuggesting(true);
    try {
      const data = await customFetch("/api/pantry/ai-suggest", { method: "POST", headers: { "Content-Type": "application/json" } }) as any;
      setSuggestions(data.suggestions ?? []);
    } catch { /* ignore */ }
    setSuggesting(false);
  }

  const filtered = filter === "all" ? items : items.filter(i => i.category === filter);
  const expiredCount = items.filter(i => expiryStatus(i) === "expired").length;
  const expiringSoon = items.filter(i => expiryStatus(i) === "soon").length;

  return (
    <div className="min-h-screen bg-background p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ShoppingBasket className="h-6 w-6 text-primary" /> Pantry</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {items.length} items
            {expiredCount > 0 && <span className="text-red-500 font-medium"> · {expiredCount} expired</span>}
            {expiringSoon > 0 && <span className="text-yellow-600 font-medium"> · {expiringSoon} expiring soon</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={getSuggestions} disabled={suggesting || items.length === 0} className="flex items-center gap-2 rounded-lg bg-violet-500/10 px-4 py-2 text-sm font-medium text-violet-700 hover:bg-violet-500/20 disabled:opacity-50">
            <Sparkles className="h-4 w-4" />{suggesting ? "Thinking..." : "Suggest Meals"}
          </button>
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            <Plus className="h-4 w-4" /> Add Item
          </button>
        </div>
      </div>

      {/* AI suggestions */}
      {suggestions && suggestions.length > 0 && (
        <div className="mb-6 rounded-xl border border-violet-500/30 bg-violet-500/5 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold flex items-center gap-2"><ChefHat className="h-4 w-4 text-violet-500" /> Meal Ideas from Your Pantry</h2>
            <button onClick={() => setSuggestions(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {suggestions.map((s, i) => (
              <div key={i} className="rounded-lg bg-background border p-4">
                <div className="flex items-center gap-2 mb-2"><span className="text-2xl">{s.emoji}</span><p className="font-medium">{s.name}</p></div>
                <p className="text-xs text-muted-foreground mb-2">{s.description}</p>
                <p className="text-xs">Uses: {s.uses.join(", ")}</p>
                <p className="text-xs text-muted-foreground mt-1">⏱ {s.cookTime}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Category filter */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {["all", ...CATEGORIES].map(cat => (
          <button key={cat} onClick={() => setFilter(cat)} className={cn("rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap", filter === cat ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80")}>
            {cat === "all" ? "All" : `${CATEGORY_ICONS[cat]} ${cat.charAt(0).toUpperCase() + cat.slice(1)}`}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><ShoppingBasket className="h-12 w-12 mx-auto mb-3 opacity-20" /><p className="font-medium">Pantry is empty</p></div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map(item => {
            const es = expiryStatus(item);
            return (
              <div key={item.id} className={cn("rounded-xl border bg-card p-3 flex flex-col gap-2", es === "expired" && "border-red-500/50 bg-red-500/5", es === "soon" && "border-yellow-500/50 bg-yellow-500/5")}>
                <div className="flex items-center justify-between">
                  <span className="text-xl">{CATEGORY_ICONS[item.category] ?? "📦"}</span>
                  <button onClick={() => deleteMutation.mutate(item.id)} className="text-muted-foreground hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
                <p className="font-medium text-sm">{item.name}</p>
                {item.quantity && <p className="text-xs text-muted-foreground">{item.quantity}</p>}
                {item.expiresAt && (
                  <p className={cn("text-xs", es === "expired" ? "text-red-500 font-medium" : es === "soon" ? "text-yellow-600 font-medium" : "text-muted-foreground")}>
                    {es === "expired" ? "Expired" : "Exp"}: {new Date(item.expiresAt).toLocaleDateString()}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-semibold">Add Pantry Item</h2><button onClick={() => setShowAdd(false)}><X className="h-5 w-5" /></button></div>
            <div className="space-y-3">
              <input className="w-full rounded-lg border bg-background px-3 py-2 text-sm" placeholder="Item name *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              <div className="grid grid-cols-2 gap-3">
                <input className="rounded-lg border bg-background px-3 py-2 text-sm" placeholder="Quantity (e.g. 2 cans)" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
                <select className="rounded-lg border bg-background px-3 py-2 text-sm" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_ICONS[c]} {c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                </select>
              </div>
              <div><label className="text-xs text-muted-foreground">Expiry date (optional)</label><input type="date" className="w-full rounded-lg border bg-background px-3 py-2 text-sm" value={form.expiresAt} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))} /></div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowAdd(false)} className="flex-1 rounded-lg border px-4 py-2 text-sm">Cancel</button>
              <button disabled={!form.name || addMutation.isPending} onClick={() => addMutation.mutate({ ...form, expiresAt: form.expiresAt || undefined })} className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
                {addMutation.isPending ? "Adding..." : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
