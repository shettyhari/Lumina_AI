import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useUser } from "@clerk/react";
import { Trophy, Plus, Star, X, Gift, Check, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface Reward { id: number; title: string; description?: string; pointCost: number; emoji: string; }
interface Balance { memberId: number; clerkUserId: string; name: string; earned: number; spent: number; balance: number; }
interface Redemption { id: number; rewardId: number; clerkUserId: string; pointsSpent: number; status: string; redeemedAt: string; }

export default function RewardsPage() {
  const qc = useQueryClient();
  const { user } = useUser();
  const [tab, setTab] = useState<"catalog" | "leaderboard" | "requests">("catalog");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", pointCost: "", emoji: "🎁" });

  const { data: catalog = [] } = useQuery<Reward[]>({ queryKey: ["rewards-catalog"], queryFn: () => customFetch("/api/rewards") });
  const { data: balances = [] } = useQuery<Balance[]>({ queryKey: ["rewards-balances"], queryFn: () => customFetch("/api/rewards/balances") });
  const { data: redemptions = [] } = useQuery<Redemption[]>({ queryKey: ["rewards-redemptions"], queryFn: () => customFetch("/api/rewards/redemptions") });

  const myBalance = balances.find(b => b.clerkUserId === user?.id)?.balance ?? 0;

  const redeemMutation = useMutation({
    mutationFn: (rewardId: number) => customFetch("/api/rewards/redeem", { method: "POST", body: JSON.stringify({ rewardId }), headers: { "Content-Type": "application/json" } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rewards-redemptions"] }),
  });

  const addMutation = useMutation({
    mutationFn: (body: object) => customFetch("/api/rewards", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["rewards-catalog"] }); setShowAdd(false); setForm({ title: "", description: "", pointCost: "", emoji: "🎁" }); },
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => customFetch(`/api/rewards/redemptions/${id}`, { method: "PATCH", body: JSON.stringify({ status }), headers: { "Content-Type": "application/json" } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rewards-redemptions"] }),
  });

  const tabs = [{ id: "catalog", label: "Rewards" }, { id: "leaderboard", label: "Leaderboard" }, { id: "requests", label: `Requests ${redemptions.filter(r => r.status === "pending").length > 0 ? `(${redemptions.filter(r => r.status === "pending").length})` : ""}` }] as const;

  return (
    <div className="min-h-screen bg-background p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Trophy className="h-6 w-6 text-primary" /> Chore Rewards</h1>
          <p className="text-muted-foreground text-sm mt-1">You have <span className="font-semibold text-primary">{myBalance} ⭐ points</span> to spend</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          <Plus className="h-4 w-4" /> Add Reward
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 rounded-xl bg-muted p-1">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={cn("flex-1 rounded-lg py-2 text-sm font-medium transition-colors", tab === t.id ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground")}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "catalog" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {catalog.length === 0 ? (
            <div className="col-span-2 text-center py-12 text-muted-foreground"><Gift className="h-10 w-10 mx-auto mb-2 opacity-20" /><p>No rewards yet. Add some to motivate the family!</p></div>
          ) : catalog.map(reward => (
            <div key={reward.id} className="rounded-xl border bg-card p-5 flex items-center gap-4">
              <span className="text-4xl">{reward.emoji}</span>
              <div className="flex-1">
                <p className="font-semibold">{reward.title}</p>
                {reward.description && <p className="text-xs text-muted-foreground mt-0.5">{reward.description}</p>}
                <p className="text-sm font-medium text-primary mt-2 flex items-center gap-1"><Star className="h-3.5 w-3.5" /> {reward.pointCost} points</p>
              </div>
              <button disabled={myBalance < reward.pointCost || redeemMutation.isPending}
                onClick={() => redeemMutation.mutate(reward.id)}
                className={cn("rounded-lg px-4 py-2 text-xs font-medium", myBalance >= reward.pointCost ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-muted text-muted-foreground cursor-not-allowed")}>
                {myBalance >= reward.pointCost ? "Redeem" : "Not enough"}
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === "leaderboard" && (
        <div className="space-y-3">
          {[...balances].sort((a, b) => b.balance - a.balance).map((b, i) => (
            <div key={b.memberId} className="rounded-xl border bg-card p-4 flex items-center gap-4">
              <div className={cn("text-2xl font-bold w-8 text-center", i === 0 ? "text-yellow-500" : i === 1 ? "text-slate-400" : i === 2 ? "text-amber-600" : "text-muted-foreground")}>
                {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
              </div>
              <div className="flex-1">
                <p className="font-medium">{b.name}</p>
                <p className="text-xs text-muted-foreground">{b.earned} earned · {b.spent} spent</p>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold">{b.balance}</p>
                <p className="text-xs text-muted-foreground">⭐ points</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "requests" && (
        <div className="space-y-3">
          {redemptions.length === 0 ? <div className="text-center py-12 text-muted-foreground">No redemption requests yet.</div>
          : redemptions.map(r => (
            <div key={r.id} className="rounded-xl border bg-card p-4 flex items-center gap-4">
              <div className={cn("rounded-full p-2", r.status === "approved" ? "bg-green-100 text-green-600" : r.status === "rejected" ? "bg-red-100 text-red-600" : "bg-yellow-100 text-yellow-600")}>
                {r.status === "approved" ? <Check className="h-4 w-4" /> : r.status === "rejected" ? <X className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
              </div>
              <div className="flex-1">
                <p className="font-medium">Reward #{r.rewardId} · {r.pointsSpent} pts</p>
                <p className="text-xs text-muted-foreground">{new Date(r.redeemedAt).toLocaleDateString()} · <span className="capitalize">{r.status}</span></p>
              </div>
              {r.status === "pending" && (
                <div className="flex gap-2">
                  <button onClick={() => approveMutation.mutate({ id: r.id, status: "approved" })} className="rounded-lg bg-green-500/10 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-500/20">Approve</button>
                  <button onClick={() => approveMutation.mutate({ id: r.id, status: "rejected" })} className="rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-500/20">Reject</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-semibold">Add Reward</h2><button onClick={() => setShowAdd(false)}><X className="h-5 w-5" /></button></div>
            <div className="space-y-3">
              <div className="flex gap-3">
                <input className="w-16 rounded-lg border bg-background px-3 py-2 text-center text-xl" placeholder="🎁" value={form.emoji} onChange={e => setForm(f => ({ ...f, emoji: e.target.value }))} />
                <input className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm" placeholder="Reward title *" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <input className="w-full rounded-lg border bg-background px-3 py-2 text-sm" placeholder="Description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              <input type="number" className="w-full rounded-lg border bg-background px-3 py-2 text-sm" placeholder="Point cost *" value={form.pointCost} onChange={e => setForm(f => ({ ...f, pointCost: e.target.value }))} />
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowAdd(false)} className="flex-1 rounded-lg border px-4 py-2 text-sm">Cancel</button>
              <button disabled={!form.title || !form.pointCost || addMutation.isPending} onClick={() => addMutation.mutate({ ...form, pointCost: Number(form.pointCost) })} className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
                {addMutation.isPending ? "Adding..." : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
