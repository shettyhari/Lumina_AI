import { useState, useMemo } from "react";
import { ShoppingCart, Plus, Trash2, Check, X } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

interface ShoppingItem {
  id: number;
  clerkUserId: string;
  name: string;
  quantity: string;
  category: string;
  isChecked: boolean;
  sortOrder: number;
  createdAt: string;
  adderName: string;
  adderAvatarUrl: string | null;
}

const CATEGORIES = ["Produce", "Dairy", "Meat", "Bakery", "Frozen", "Pantry", "Beverages", "Snacks", "Household", "Other"];
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function ShoppingPage() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [category, setCategory] = useState("Other");
  const [adding, setAdding] = useState(false);

  const { data: items = [], isLoading } = useQuery<ShoppingItem[]>({
    queryKey: ["/api/shopping"],
    queryFn: () => customFetch(`${BASE}/api/shopping`),
    refetchInterval: 15_000,
  });

  const addMutation = useMutation({
    mutationFn: (body: object) => customFetch(`${BASE}/api/shopping`, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/shopping"] }); setName(""); setQuantity("1"); setAdding(false); },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isChecked }: { id: number; isChecked: boolean }) =>
      customFetch(`${BASE}/api/shopping/${id}`, { method: "PATCH", body: JSON.stringify({ isChecked }), headers: { "Content-Type": "application/json" } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/shopping"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => customFetch(`${BASE}/api/shopping/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/shopping"] }),
  });

  const clearCompletedMutation = useMutation({
    mutationFn: () => customFetch(`${BASE}/api/shopping/completed`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/shopping"] }),
  });

  const grouped = useMemo(() => {
    const unchecked = items.filter((i) => !i.isChecked);
    const checked = items.filter((i) => i.isChecked);
    const byCategory = (list: ShoppingItem[]) =>
      list.reduce<Record<string, ShoppingItem[]>>((acc, item) => {
        (acc[item.category] ??= []).push(item);
        return acc;
      }, {});
    return { unchecked: byCategory(unchecked), checked };
  }, [items]);

  const hasCompleted = items.some((i) => i.isChecked);

  return (
    <div className="flex flex-col h-full overflow-auto p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-500/15">
          <ShoppingCart className="h-5 w-5 text-green-400" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Shopping List</h1>
          <p className="text-sm text-muted-foreground">{items.filter((i) => !i.isChecked).length} items remaining</p>
        </div>
        <div className="ml-auto flex gap-2">
          {hasCompleted && (
            <button onClick={() => clearCompletedMutation.mutate()} className="text-xs text-muted-foreground hover:text-destructive transition-colors px-3 py-1.5 rounded-lg border border-border/50 hover:border-destructive/30">
              Clear completed
            </button>
          )}
          <button onClick={() => setAdding(!adding)} className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
            {adding ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {adding ? "Cancel" : "Add item"}
          </button>
        </div>
      </div>

      {adding && (
        <div className="mb-6 p-4 rounded-xl border border-border/50 bg-card/50 space-y-3">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && name.trim() && addMutation.mutate({ name, quantity, category })}
            placeholder="Item name…"
            className="w-full bg-background/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="flex gap-2">
            <input
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Qty"
              className="w-20 bg-background/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="flex-1 bg-background/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <button
              onClick={() => name.trim() && addMutation.mutate({ name, quantity, category })}
              disabled={!name.trim() || addMutation.isPending}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 text-muted-foreground py-16">
          <ShoppingCart className="h-12 w-12 opacity-20" />
          <p className="text-sm">Your shopping list is empty.<br />Add items above or ask Lumina in chat.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped.unchecked).map(([cat, catItems]) => (
            <div key={cat}>
              <h3 className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider mb-2 px-1">{cat}</h3>
              <div className="space-y-1.5">
                {catItems.map((item) => (
                  <ItemRow key={item.id} item={item} onToggle={() => toggleMutation.mutate({ id: item.id, isChecked: !item.isChecked })} onDelete={() => deleteMutation.mutate(item.id)} />
                ))}
              </div>
            </div>
          ))}

          {grouped.checked.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground/40 uppercase tracking-wider mb-2 px-1">Completed ({grouped.checked.length})</h3>
              <div className="space-y-1.5 opacity-50">
                {grouped.checked.map((item) => (
                  <ItemRow key={item.id} item={item} onToggle={() => toggleMutation.mutate({ id: item.id, isChecked: false })} onDelete={() => deleteMutation.mutate(item.id)} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ItemRow({ item, onToggle, onDelete }: { item: ShoppingItem; onToggle: () => void; onDelete: () => void }) {
  return (
    <div className={cn("flex items-center gap-3 px-3 py-2.5 rounded-lg border group transition-colors", item.isChecked ? "border-border/20 bg-muted/10" : "border-border/40 bg-card/30 hover:border-border/60")}>
      <button onClick={onToggle} className={cn("h-5 w-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors", item.isChecked ? "bg-green-500 border-green-500" : "border-muted-foreground/40 hover:border-primary")}>
        {item.isChecked && <Check className="h-3 w-3 text-white" />}
      </button>
      <span className={cn("flex-1 text-sm", item.isChecked ? "line-through text-muted-foreground/40" : "text-foreground")}>
        {item.name}
      </span>
      {item.quantity && item.quantity !== "1" && (
        <span className="text-xs text-muted-foreground bg-muted/30 px-2 py-0.5 rounded-full">{item.quantity}</span>
      )}
      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {item.adderAvatarUrl ? (
          <img src={item.adderAvatarUrl} alt={item.adderName} className="h-5 w-5 rounded-full border border-border" title={`Added by ${item.adderName}`} />
        ) : (
          <div className="h-5 w-5 rounded-full bg-muted/50 flex items-center justify-center" title={`Added by ${item.adderName}`}>
            <span className="text-[8px] text-muted-foreground">{item.adderName[0]}</span>
          </div>
        )}
        <button onClick={onDelete} className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
