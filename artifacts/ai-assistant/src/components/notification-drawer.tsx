import { useEffect, useRef } from "react";
import { X, Bell, Check, CheckCheck } from "lucide-react";
import {
  useListFamilyNotifications,
  getListFamilyNotificationsQueryKey,
  useMarkFamilyNotificationRead,
  useMarkAllFamilyNotificationsRead,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

interface NotificationDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function NotificationDrawer({ open, onClose }: NotificationDrawerProps) {
  const queryClient = useQueryClient();
  const drawerRef = useRef<HTMLDivElement>(null);

  const { data: notifications = [], isLoading } = useListFamilyNotifications({
    query: {
      queryKey: getListFamilyNotificationsQueryKey(),
      refetchInterval: open ? 10_000 : false,
    },
  });

  const markRead = useMarkFamilyNotificationRead();
  const markAllRead = useMarkAllFamilyNotificationsRead();

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const handleMarkRead = (id: number) => {
    markRead.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListFamilyNotificationsQueryKey() });
          queryClient.invalidateQueries({ queryKey: ["/api/family/notifications/count"] });
        },
      }
    );
  };

  const handleMarkAllRead = () => {
    markAllRead.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListFamilyNotificationsQueryKey() });
        queryClient.invalidateQueries({ queryKey: ["/api/family/notifications/count"] });
      },
    });
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-40 transition-opacity duration-200",
          open ? "opacity-100 bg-background/50 backdrop-blur-sm" : "opacity-0 pointer-events-none"
        )}
        aria-hidden
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        className={cn(
          "fixed right-0 top-0 bottom-0 z-50 w-80 bg-card border-l border-border shadow-2xl transition-transform duration-300 ease-in-out flex flex-col",
          open ? "translate-x-0" : "translate-x-full"
        )}
        aria-label="Notifications"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            <span className="font-semibold text-foreground">Notifications</span>
            {notifications.length > 0 && (
              <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground leading-none">
                {notifications.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {notifications.length > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                title="Mark all read"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                All read
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {isLoading && (
            <div className="flex justify-center py-8">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          )}

          {!isLoading && notifications.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
                <Bell className="h-6 w-6 text-primary/40" />
              </div>
              <p className="text-sm text-muted-foreground">No unread messages</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Family notes sent via AI relay appear here
              </p>
            </div>
          )}

          <div className="divide-y divide-border/50">
            {notifications.map((note) => (
              <div key={note.id} className="flex gap-3 p-4 hover:bg-accent/30 transition-colors group">
                {/* Avatar */}
                <div className="shrink-0">
                  {note.fromAvatarUrl ? (
                    <img
                      src={note.fromAvatarUrl}
                      alt={note.fromName}
                      className="h-9 w-9 rounded-full object-cover"
                    />
                  ) : (
                    <div className="h-9 w-9 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold text-xs">
                      {note.fromName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{note.fromName}</p>
                  <p className="text-sm text-muted-foreground mt-0.5 line-clamp-3 leading-snug">
                    {note.content}
                  </p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">
                    {timeAgo(note.createdAt as unknown as string)}
                  </p>
                </div>

                {/* Mark read button */}
                <button
                  onClick={() => handleMarkRead(note.id)}
                  className="shrink-0 opacity-0 group-hover:opacity-100 rounded-md p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-all"
                  title="Mark as read"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
