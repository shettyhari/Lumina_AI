import { useGetUserStats, getGetUserStatsQueryKey, useGetRecentActivity, getGetRecentActivityQueryKey, useGetPinnedConversations, getGetPinnedConversationsQueryKey } from "@workspace/api-client-react";
import { MessageSquare, Image as ImageIcon, Zap, Clock, Pin } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";

export default function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useGetUserStats({
    query: { queryKey: getGetUserStatsQueryKey() }
  });

  const { data: recentActivity, isLoading: activityLoading } = useGetRecentActivity({
    query: { queryKey: getGetRecentActivityQueryKey() }
  });

  const { data: pinnedConversations, isLoading: pinnedLoading } = useGetPinnedConversations({
    query: { queryKey: getGetPinnedConversationsQueryKey() }
  });

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

  return (
    <div className="flex-1 h-full overflow-y-auto scrollbar-thin p-6 md:p-10 pb-20">
      <div className="max-w-5xl mx-auto space-y-10">
        
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Dashboard</h1>
          <p className="text-muted-foreground">Overview of your intelligence workspace.</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-glass rounded-2xl p-6 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
              <MessageSquare className="w-16 h-16 text-primary" />
            </div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Total Conversations</p>
            <p className="text-4xl font-bold tracking-tight">{stats?.totalConversations || 0}</p>
          </div>
          
          <div className="bg-glass rounded-2xl p-6 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
              <Zap className="w-16 h-16 text-cyan-400" />
            </div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Total Messages</p>
            <p className="text-4xl font-bold tracking-tight">{stats?.totalMessages || 0}</p>
          </div>
          
          <div className="bg-glass rounded-2xl p-6 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
              <ImageIcon className="w-16 h-16 text-purple-400" />
            </div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Images Generated</p>
            <p className="text-4xl font-bold tracking-tight">{stats?.imagesGenerated || 0}</p>
          </div>
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
                <p className="text-muted-foreground">No pinned conversations yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pinnedConversations.map(conv => (
                  <Link key={conv.id} href={`/chat/${conv.id}`}>
                    <div className="bg-card/40 hover:bg-card/80 border border-border/50 rounded-xl p-4 cursor-pointer transition-colors group">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-medium truncate pr-4 text-foreground group-hover:text-primary transition-colors">{conv.title}</h3>
                        <span className="text-xs text-muted-foreground shrink-0">{format(new Date(conv.updatedAt), "MMM d")}</span>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {conv.messageCount > 0 ? `${conv.messageCount} message${conv.messageCount === 1 ? '' : 's'}` : "Empty conversation"}
                      </p>
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
                <p className="text-muted-foreground">No recent activity.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentActivity.slice(0, 5).map(conv => (
                  <Link key={conv.id} href={`/chat/${conv.id}`}>
                    <div className="bg-card/40 hover:bg-card/80 border border-border/50 rounded-xl p-4 cursor-pointer transition-colors group">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-medium truncate pr-4 text-foreground group-hover:text-cyan-400 transition-colors">{conv.title}</h3>
                        <span className="text-xs text-muted-foreground shrink-0">{format(new Date(conv.updatedAt), "MMM d")}</span>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {conv.messageCount > 0 ? `${conv.messageCount} message${conv.messageCount === 1 ? '' : 's'}` : "Empty conversation"}
                      </p>
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