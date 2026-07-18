import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useUser } from "@clerk/react";
import { Gift, Plus, X, ExternalLink, Check, Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface WishItem { id: number; clerkUserId: string; title: string; description?: string; url?: string; priceCents?: number; priority: string; isClaimed: boolean; claimedBy?: string | null; isClaimedByMe?: boolean; createdAt: string; }

const PRIORITIES = ["low", "medium", "high"];
const PRIORITY_COLOR: Record<string, string> = { low: "text-muted-foreground", medium: "text-blue-500", high: "text-red-500" };
const PRIORITY_STARS: Record<string, number> = { low: 1, medium: 2, high: 3 };

export default function WishlistPage() {
  const qc = useQueryClient();
  const { user } = useUser();
  const [tab, setTab] = useState<"mine" | "family">("mine");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", url: "", priceCents: "", priority: "medium" });

  const { data: mine = [] } = useQuery<WishItem[]>({ queryKey: ["wishlist-mine"], queryFn: () => customFetch("/api/wishlist") });
  const { data: family = [] } = useQuery<WishItem[]>({ queryKey: ["wishlist-family"], queryFn: () => customFetch("/api/wishlist/family") });

  const addMutation = useMutation({
    mutationFn: (body: object) => customFetch("/api/wishlist", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wishlist-mine"] }); setShowAdd(false); setForm({ title: "", description: "", url: "", priceCents: "", priority: "medium" }); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => customFetch(`/api/wishlist/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wishlist-mine"] }),
  });

  const claimMutation = useMutation({
    mutationFn: (id: number) => customFetch(`/api/wishlist/${id}/claim`, { method: "POST", headers: { "Content-Type": "application/json" } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wishlist-family"] }),
  });

  const othersWishes = family.filter(i => i.clerkUserId !== user?.id);

  function WishCard({ item, isOwner }: { item: WishItem; isOwner: boolean }) {
    return (
      <div className={cn("rounded-xl border bg-card p-4", item.isClaimed && !isOwner && "opacity-60")}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium">{item.title}</p>
              <span className={cn("flex", PRIORITY_COLOR[item.priority])}>
                {Array.from({ length: PRIORITY_STARS[item.priority] ?? 1 }).map((_, i) => <Star key={i} className="h-3 w-3 fill-current" />)}
              </span>
            </div>
            {item.description && <p className="text-sm text-muted-foreground mt-0.5">{item.description}</p>}
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              {item.priceCents && <span className="text-sm font-medium">${(item.priceCents / 100).toFixed(2)}</span>}
              {item.url && <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary flex items-center gap-1 hover:underline"><ExternalLink className="h-3 w-3" />View</a>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!isOwner && (
              <button onClick={() => claimMutation.mutate(item.id)} className={cn("rounded-lg px-3 py-1.5 text-xs font-medium", item.isClaimedByMe ? "bg-green-500/10 text-green-700" : item.isClaimed ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary hover:bg-primary/20")}>
                {item.isClaimedByMe ? <><Check className="h-3 w-3 inline mr-1" />Claimed</> : item.isClaimed ? "Taken" : "Claim 🎁"}
              </button>
            )}
            {isOwner && <button onClick={() => deleteMutation.mutate(item.id)} className="rounded-lg p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10"><X className="h-3.5 w-3.5" /></button>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Gift className="h-6 w-6 text-primary" /> Family Wishlist</h1>
          <p className="text-muted-foreground text-sm mt-1">Share wishes · claim gifts secretly 🤫</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          <Plus className="h-4 w-4" /> Add Wish
        </button>
      </div>

      <div className="flex gap-1 mb-6 rounded-xl bg-muted p-1">
        {[{ id: "mine", label: `My List (${mine.length})` }, { id: "family", label: `Family Lists (${othersWishes.length})` }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as "mine" | "family")} className={cn("flex-1 rounded-lg py-2 text-sm font-medium transition-colors", tab === t.id ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground")}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "mine" && (
        <div className="space-y-3">
          {mine.length === 0 ? <div className="text-center py-12 text-muted-foreground"><Gift className="h-10 w-10 mx-auto mb-2 opacity-20" /><p>Your wishlist is empty. Add something!</p></div>
          : mine.map(item => <WishCard key={item.id} item={item} isOwner={true} />)}
        </div>
      )}

      {tab === "family" && (
        <div className="space-y-3">
          {othersWishes.length === 0 ? <div className="text-center py-12 text-muted-foreground"><p>No family wishlists yet.</p></div>
          : othersWishes.map(item => <WishCard key={item.id} item={item} isOwner={false} />)}
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-semibold">Add to Wishlist</h2><button onClick={() => setShowAdd(false)}><X className="h-5 w-5" /></button></div>
            <div className="space-y-3">
              <input className="w-full rounded-lg border bg-background px-3 py-2 text-sm" placeholder="What do you wish for? *" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              <input className="w-full rounded-lg border bg-background px-3 py-2 text-sm" placeholder="Description (optional)" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              <input className="w-full rounded-lg border bg-background px-3 py-2 text-sm" placeholder="Link (optional)" value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} />
              <div className="grid grid-cols-2 gap-3">
                <input type="number" className="rounded-lg border bg-background px-3 py-2 text-sm" placeholder="Price (e.g. 49.99)" value={form.priceCents} onChange={e => setForm(f => ({ ...f, priceCents: e.target.value }))} />
                <select className="rounded-lg border bg-background px-3 py-2 text-sm" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                  {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)} priority</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowAdd(false)} className="flex-1 rounded-lg border px-4 py-2 text-sm">Cancel</button>
              <button disabled={!form.title || addMutation.isPending} onClick={() => addMutation.mutate({ ...form, priceCents: form.priceCents ? Math.round(Number(form.priceCents) * 100) : undefined })} className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
                {addMutation.isPending ? "Adding..." : "Add Wish"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
