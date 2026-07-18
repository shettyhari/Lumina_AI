import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAdminUsers,
  useGetAdminStats,
  useUpdateAdminUser,
  useDeleteAdminUser,
  getListAdminUsersQueryKey,
  getGetAdminStatsQueryKey,
} from "@workspace/api-client-react";
import {
  Shield, Users, HardDrive, CheckCircle, XCircle, Clock,
  Trash2, ChevronDown, ToggleLeft, ToggleRight, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "pending" | "approved" | "rejected";

function StatusBadge({ status, role }: { status: string; role: string }) {
  if (role === "admin") return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/20 px-2.5 py-0.5 text-xs font-medium text-primary">
      <Shield className="h-3 w-3" /> Admin
    </span>
  );
  if (status === "approved") return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
      <CheckCircle className="h-3 w-3" /> Approved
    </span>
  );
  if (status === "rejected") return (
    <span className="inline-flex items-center gap-1 rounded-full bg-destructive/20 px-2.5 py-0.5 text-xs font-medium text-destructive">
      <XCircle className="h-3 w-3" /> Rejected
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-medium text-amber-400">
      <Clock className="h-3 w-3" /> Pending
    </span>
  );
}

function StorageBar({ used, quota }: { used: number; quota: number }) {
  const pct = quota > 0 ? Math.min(100, (used / quota) * 100) : 0;
  const color = pct > 90 ? "bg-destructive" : pct > 70 ? "bg-amber-500" : "bg-primary";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{formatBytes(used)} used</span>
        <span>{formatBytes(quota)} quota</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-secondary">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function FeatureToggle({ label, enabled, onToggle }: { label: string; enabled: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors",
        enabled ? "bg-primary/15 text-primary hover:bg-primary/25" : "bg-secondary text-muted-foreground hover:bg-secondary/70"
      )}
    >
      {enabled ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}
      {label}
    </button>
  );
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(0)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function MemberAvatar({ name, avatarUrl }: { name?: string | null; avatarUrl?: string | null }) {
  if (avatarUrl) return <img src={avatarUrl} alt={name || "User"} className="h-9 w-9 rounded-full border border-border object-cover" />;
  const initials = name ? name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() : "?";
  const colors = ["bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-pink-500", "bg-amber-500"];
  const color = colors[(name?.charCodeAt(0) ?? 0) % colors.length];
  return (
    <div className={cn("flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white", color)}>
      {initials}
    </div>
  );
}

const QUOTA_OPTIONS = [
  { label: "50 MB", bytes: 52_428_800 },
  { label: "100 MB", bytes: 104_857_600 },
  { label: "500 MB", bytes: 524_288_000 },
  { label: "1 GB", bytes: 1_073_741_824 },
  { label: "5 GB", bytes: 5_368_709_120 },
];

export default function AdminPage() {
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: members = [], isLoading } = useListAdminUsers();
  const { data: stats } = useGetAdminStats();
  const updateMember = useUpdateAdminUser();
  const deleteMember = useDeleteAdminUser();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetAdminStatsQueryKey() });
  };

  const handleStatus = (userId: string, status: string) => {
    updateMember.mutate({ userId, data: { status } }, { onSuccess: invalidate });
  };

  const handleFeatureToggle = (userId: string, flags: Record<string, boolean>, key: string) => {
    const newFlags = { ...flags, [key]: !flags[key] };
    updateMember.mutate({ userId, data: { featureFlags: newFlags as any } }, { onSuccess: invalidate });
  };

  const handleQuota = (userId: string, bytes: number) => {
    updateMember.mutate({ userId, data: { storageQuotaBytes: bytes } }, { onSuccess: invalidate });
  };

  const handleDelete = (userId: string) => {
    deleteMember.mutate({ userId }, {
      onSuccess: () => { setConfirmDelete(null); invalidate(); },
    });
  };

  const filtered = members.filter((m) => {
    if (filter === "all") return true;
    if (filter === "pending") return m.status === "pending";
    if (filter === "approved") return m.status === "approved" || m.role === "admin";
    if (filter === "rejected") return m.status === "rejected";
    return true;
  });

  const featureLabels: Record<string, string> = {
    imageGen: "Image Gen",
    voiceChat: "Voice",
    personas: "Personas",
    memories: "Memory",
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-6 py-8 space-y-8">
          {/* Header */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Shield className="h-5 w-5 text-primary" />
              <h1 className="text-2xl font-bold text-foreground">Family Admin</h1>
            </div>
            <p className="text-muted-foreground text-sm">Manage family member access, storage quotas, and feature permissions.</p>
          </div>

          {/* Stats bar */}
          {stats && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                { label: "Total Members", value: stats.totalMembers, icon: Users, color: "text-blue-400" },
                { label: "Pending", value: stats.pendingCount, icon: Clock, color: "text-amber-400" },
                { label: "Approved", value: stats.approvedCount, icon: CheckCircle, color: "text-emerald-400" },
                { label: "Storage Used", value: `${formatBytes(stats.totalUsedBytes ?? 0)} / ${formatBytes(stats.totalQuotaBytes ?? 0)}`, icon: HardDrive, color: "text-primary" },
              ].map((stat) => (
                <div key={stat.label} className="rounded-xl border border-border bg-card p-4">
                  <div className={cn("mb-1", stat.color)}><stat.icon className="h-4 w-4" /></div>
                  <div className="text-2xl font-bold text-foreground">{stat.value}</div>
                  <div className="text-xs text-muted-foreground">{stat.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Filter tabs */}
          <div className="flex gap-1 rounded-xl bg-secondary p-1 w-fit">
            {(["all", "pending", "approved", "rejected"] as StatusFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-lg px-4 py-1.5 text-sm font-medium capitalize transition-colors",
                  filter === f ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {f}
                {f === "pending" && stats?.pendingCount ? (
                  <span className="ml-1.5 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-xs text-amber-400">{stats.pendingCount}</span>
                ) : null}
              </button>
            ))}
          </div>

          {/* Members list */}
          {isLoading ? (
            <div className="text-center py-16 text-muted-foreground">Loading members…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">No members in this category.</div>
          ) : (
            <div className="space-y-3">
              {filtered.map((member) => {
                const flags = (member.featureFlags ?? {}) as Record<string, boolean>;
                const name = member.displayName || member.email || `User ${member.id}`;
                const isAdmin = member.role === "admin";

                return (
                  <div key={member.clerkUserId} className="rounded-xl border border-border bg-card p-4 space-y-4">
                    {/* Top row: avatar + name + status + actions */}
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3 min-w-0">
                        <MemberAvatar name={member.displayName} avatarUrl={member.avatarUrl} />
                        <div className="min-w-0">
                          <div className="font-medium text-foreground truncate">{name}</div>
                          {member.email && <div className="text-xs text-muted-foreground truncate">{member.email}</div>}
                          <div className="text-xs text-muted-foreground/60 truncate font-mono mt-0.5">{member.clerkUserId.slice(0, 20)}…</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <StatusBadge status={member.status ?? "pending"} role={member.role ?? "member"} />

                        {!isAdmin && member.status !== "approved" && (
                          <button
                            onClick={() => handleStatus(member.clerkUserId, "approved")}
                            disabled={updateMember.isPending}
                            className="rounded-lg bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-400 hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
                          >
                            ✓ Approve
                          </button>
                        )}
                        {!isAdmin && member.status !== "rejected" && (
                          <button
                            onClick={() => handleStatus(member.clerkUserId, "rejected")}
                            disabled={updateMember.isPending}
                            className="rounded-lg bg-destructive/15 px-3 py-1 text-xs font-medium text-destructive hover:bg-destructive/25 transition-colors disabled:opacity-50"
                          >
                            ✗ Reject
                          </button>
                        )}
                        {!isAdmin && (
                          <button
                            onClick={() => setConfirmDelete(member.clerkUserId)}
                            className="rounded-lg bg-secondary p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Storage bar */}
                    <div className="space-y-2">
                      <StorageBar used={member.storageUsedBytes ?? 0} quota={member.storageQuotaBytes ?? 104857600} />
                      {!isAdmin && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Quota:</span>
                          <div className="relative">
                            <select
                              defaultValue={member.storageQuotaBytes ?? 104857600}
                              onChange={(e) => handleQuota(member.clerkUserId, Number(e.target.value))}
                              className="appearance-none rounded-md bg-secondary border border-border px-2 py-1 pr-6 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                            >
                              {QUOTA_OPTIONS.map((opt) => (
                                <option key={opt.bytes} value={opt.bytes}>{opt.label}</option>
                              ))}
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Feature flags */}
                    {!isAdmin && (
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(featureLabels).map(([key, label]) => (
                          <FeatureToggle
                            key={key}
                            label={label}
                            enabled={flags[key] ?? true}
                            onToggle={() => handleFeatureToggle(member.clerkUserId, flags, key)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Confirm delete modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-2xl w-full max-w-sm mx-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <div className="font-semibold text-foreground">Remove Member</div>
                <div className="text-xs text-muted-foreground">This cannot be undone.</div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              The member will be removed from the family space. Their conversations and data will remain in the database but they will lose access.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                disabled={deleteMember.isPending}
                className="flex-1 rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50"
              >
                {deleteMember.isPending ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
