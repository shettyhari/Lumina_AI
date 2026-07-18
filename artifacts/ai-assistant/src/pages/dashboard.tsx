import {
  useGetUserStats, getGetUserStatsQueryKey,
  useGetRecentActivity, getGetRecentActivityQueryKey,
  useGetPinnedConversations, getGetPinnedConversationsQueryKey,
  useGetAiDigest, getGetAiDigestQueryKey,
} from "@workspace/api-client-react";
import { MessageSquare, Image as ImageIcon, Zap, Clock, Pin, Brain, Sparkles, Newspaper, RefreshCw } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { useState } from "react";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  const [digestRefreshing, setDigestRefreshing] = useState(false);

  const { data: stats, isLoading: statsLoading } = useGetUserStats({ query: { queryKey: getGetUserStatsQueryKey() } });
  const { data: recentActivity, isLoading: activityLoading } = useGetRecentActivity({ query: { queryKey: getGetRecentActivityQueryKey() } });
  const { data: pinnedConversations, isLoading: pinnedLoading } = useGetPinnedConversations({ query: { queryKey: getGetPinnedConversationsQueryKey() } });
  const { data: digest, isLoading: digestLoading, refetch: refetchDigest } = useGetAiDigest({ query: { queryKey: getGetAiDigestQueryKey() } });

  const handleRefreshDigest = async () => {
    setDigestRefreshing(true);
    await refetchDigest();
    setDigestRefreshing(false);
  };

  if (statsLoading || activityLoading || pinnedLoading) {
    return (
      <div className="flex-1 p-8 flex items-center justify-center">
        <div className="flex gap-2">
          <div className="w-3 h-3 rounded-full bg-primary/40 typing-dot"></div>
          <div className="w-3 h-3 rounded-full bg-primary/40 typing-dot"></div>
          <div className="w-3 h-3 rounded-full bg-primary/40 typing-dot"></div>
        </div>
      </div>
    );
  }

  const statCards = [
    { label: "Total Conversations", value: stats?.totalConversations ?? 0, icon: MessageSquare, color: "text-primary" },
    { label: "Total Messages", value: stats?.totalMessages ?? 0, icon: Zap, color: "text-cyan-400" },
    { label: "Images Generated", value: stats?.imagesGenerated ?? 0, icon: ImageIcon, color: "text-purple-400" },
    { label: "AI Memories", value: stats?.memoriesCount ?? 0, icon: Brain, color: "text-violet-400", href: "/memory" },
    { label: "Personas", value: stats?.personasCount ?? 0, icon: Sparkles, color: "text-amber-400", href: "/personas" },
  ];

  return (
    <div className="flex-1 h-full overflow-y-auto scrollbar-thin p-6 md:p-10 pb-20">
      <div className="max-w-5xl mx-auto space-y-10">

        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Dashboard</h1>
          <p className="text-muted-foreground">Overview of your intelligence workspace.</p>
        </div>

        {/* Daily Digest */}
        <div className="bg-glass rounded-2xl p-6 space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Newspaper className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">Daily Digest</h2>
            </div>
            <button
              onClick={handleRefreshDigest}
              disabled={digestLoading || digestRefreshing}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg hover:bg-accent transition-colors"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", (digestLoading || digestRefreshing) && "animate-spin")} />
              Refresh
            </button>
          </div>
          {digestLoading || digestRefreshing ? (
            <div className="flex gap-2 py-2">
              <div className="w-2 h-2 rounded-full bg-primary/40 typing-dot" />
              <div className="w-2 h-2 rounded-full bg-primary/40 typing-dot" />
              <div className="w-2 h-2 rounded-full bg-primary/40 typing-dot" />
            </div>
          ) : digest ? (
            <div>
              <p className="text-foreground/90 leading-relaxed">{digest.summary}</p>
              <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                <span>{digest.conversationCount} conversation{digest.conversationCount !== 1 ? "s" : ""} analyzed</span>
                <span>·</span>
                <span>{format(new Date(digest.generatedAt), "MMM d, h:mm a")}</span>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">Start chatting to get your daily digest.</p>
          )}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {statCards.map(({ label, value, icon: Icon, color, href }) => {
            const inner = (
              <div className="bg-glass rounded-2xl p-5 relative overflow-hidden group hover:border-border/50 transition-all">
                <div className={cn("absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity", color)}>
                  <Icon className="w-12 h-12" />
                </div>
                <p className="text-xs font-medium text-muted-foreground mb-1 leading-tight">{label}</p>
                <p className="text-3xl font-bold tracking-tight">{value}</p>
                {href && <p className={cn("text-xs mt-1 opacity-0 group-hover:opacity-100 transition-opacity", color)}>Manage →</p>}
              </div>
            );
            return href ? (
              <Link key={label} href={href}>{inner}</Link>
            ) : (
              <div key={label}>{inner}</div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Pinned Activity */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Pin className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-semibold tracking-tight">Pinned Threads</h2>
            </div>
            {(!pinnedConversations || pinnedConversations.length === 0) ? (
              <div className="bg-glass rounded-2xl p-8 text-center border border-dashed border-border/50">
                <p className="text-muted-foreground text-sm">No pinned conversations yet. Pin important chats from the ⋮ menu.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pinnedConversations.map(conv => (
                  <Link key={conv.id} href={`/chat/${conv.id}`}>
                    <div className="bg-card/40 hover:bg-card/80 border border-border/50 rounded-xl p-4 cursor-pointer transition-colors group">
                      <div className="flex justify-between items-start mb-1">
                        <h3 className="font-medium truncate pr-4 text-foreground group-hover:text-primary transition-colors">{conv.title}</h3>
                        <span className="text-xs text-muted-foreground shrink-0">{format(new Date(conv.updatedAt), "MMM d")}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{conv.messageCount} message{conv.messageCount !== 1 ? "s" : ""}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Recent Activity */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-cyan-400" />
              <h2 className="text-xl font-semibold tracking-tight">Recent Activity</h2>
            </div>
            {(!recentActivity || recentActivity.length === 0) ? (
              <div className="bg-glass rounded-2xl p-8 text-center border border-dashed border-border/50">
                <p className="text-muted-foreground text-sm">No recent activity. Start a new chat!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentActivity.slice(0, 5).map(conv => (
                  <Link key={conv.id} href={`/chat/${conv.id}`}>
                    <div className="bg-card/40 hover:bg-card/80 border border-border/50 rounded-xl p-4 cursor-pointer transition-colors group">
                      <div className="flex justify-between items-start mb-1">
                        <h3 className="font-medium truncate pr-4 text-foreground group-hover:text-cyan-400 transition-colors">{conv.title}</h3>
                        <span className="text-xs text-muted-foreground shrink-0">{format(new Date(conv.updatedAt), "MMM d")}</span>
                      </div>
                      {conv.lastMessage && (
                        <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{conv.lastMessage}</p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
