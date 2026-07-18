import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { useClerk, useUser } from "@clerk/react";
import {
  MessageSquare, Image as ImageIcon, LayoutDashboard, Settings,
  Plus, Pin, Menu, X, MessageCircle, LogOut, Brain, Sparkles
} from "lucide-react";
import {
  useGetRecentActivity, getGetRecentActivityQueryKey,
  useGetPinnedConversations, getGetPinnedConversationsQueryKey,
  useCreateGeminiConversation,
} from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

export default function Layout({ children }: { children: ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [location, setLocation] = useLocation();
  const { user } = useUser();
  const { signOut } = useClerk();

  const { data: recentActivity } = useGetRecentActivity({ query: { queryKey: getGetRecentActivityQueryKey() } });
  const { data: pinnedConversations } = useGetPinnedConversations({ query: { queryKey: getGetPinnedConversationsQueryKey() } });
  const createConversation = useCreateGeminiConversation();

  const handleNewChat = () => {
    createConversation.mutate(
      { data: { title: "New Conversation" } },
      { onSuccess: (data) => { setLocation(`/chat/${data.id}`); setIsSidebarOpen(false); } }
    );
  };

  const navItems = [
    { href: "/chat", icon: MessageSquare, label: "Chat" },
    { href: "/image-gen", icon: ImageIcon, label: "Image Gen" },
    { href: "/memory", icon: Brain, label: "Memory" },
    { href: "/personas", icon: Sparkles, label: "Personas" },
    { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { href: "/settings", icon: Settings, label: "Settings" },
  ];

  const SidebarContent = () => (
    <div className="flex h-full flex-col bg-sidebar border-r border-sidebar-border">
      <div className="flex items-center gap-3 px-6 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-iridescent shadow-lg">
          <img src={`${import.meta.env.BASE_URL}logo.svg`.replace('//', '/')} alt="Logo" className="w-5 h-5 object-contain filter drop-shadow-md" />
        </div>
        <span className="text-lg font-semibold tracking-tight text-foreground">Lumina</span>
      </div>

      <div className="px-4 py-2">
        <button
          onClick={handleNewChat}
          disabled={createConversation.isPending}
          className="flex w-full items-center gap-2 rounded-xl bg-primary/10 px-4 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          {createConversation.isPending ? "Starting..." : "New Chat"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-4 scrollbar-thin">
        <div className="px-4 space-y-1 mb-6">
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href === '/chat' && location.startsWith('/chat'));
            return (
              <Link key={item.href} href={item.href} onClick={() => setIsSidebarOpen(false)}>
                <div className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
                  isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
                )}>
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </div>

        {pinnedConversations && pinnedConversations.length > 0 && (
          <div className="mb-6 px-4">
            <h3 className="mb-2 px-3 text-xs font-medium text-muted-foreground/60 uppercase tracking-wider">Pinned</h3>
            <div className="space-y-0.5">
              {pinnedConversations.map((conv) => (
                <Link key={conv.id} href={`/chat/${conv.id}`} onClick={() => setIsSidebarOpen(false)}>
                  <div className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors cursor-pointer group",
                    location === `/chat/${conv.id}` ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
                  )}>
                    <Pin className="h-3.5 w-3.5 shrink-0 opacity-70" />
                    <span className="truncate">{conv.title}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {recentActivity && recentActivity.length > 0 && (
          <div className="px-4">
            <h3 className="mb-2 px-3 text-xs font-medium text-muted-foreground/60 uppercase tracking-wider">Recent</h3>
            <div className="space-y-0.5">
              {recentActivity.map((conv) => (
                <Link key={conv.id} href={`/chat/${conv.id}`} onClick={() => setIsSidebarOpen(false)}>
                  <div className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors cursor-pointer group",
                    location === `/chat/${conv.id}` ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
                  )}>
                    <MessageCircle className="h-3.5 w-3.5 shrink-0 opacity-70" />
                    <span className="truncate">{conv.title}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center justify-between gap-3 px-2 py-2">
          <div className="flex items-center gap-3 overflow-hidden">
            <img src={user?.imageUrl} alt={user?.fullName || "User"} className="h-8 w-8 rounded-full border border-border" />
            <div className="flex flex-col overflow-hidden">
              <span className="truncate text-sm font-medium text-foreground">{user?.fullName}</span>
              <span className="truncate text-xs text-muted-foreground">{user?.primaryEmailAddress?.emailAddress}</span>
            </div>
          </div>
          <button
            onClick={() => signOut({ redirectUrl: import.meta.env.BASE_URL || "/" })}
            className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors shrink-0"
            title="Log out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-[100dvh] w-full bg-background overflow-hidden selection:bg-primary/30">
      {isSidebarOpen && (
        <div className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm md:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}

      <div className={cn(
        "fixed inset-y-0 left-0 z-50 w-72 transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <SidebarContent />
      </div>

      <div className="flex flex-1 flex-col overflow-hidden relative">
        <div className="absolute inset-0 bg-iridescent opacity-5 pointer-events-none blur-[100px] mix-blend-screen"></div>

        <header className="flex h-14 items-center justify-between border-b border-border/50 bg-background/50 px-4 backdrop-blur-xl md:hidden z-10">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-iridescent">
              <img src={`${import.meta.env.BASE_URL}logo.svg`.replace('//', '/')} alt="Logo" className="w-3.5 h-3.5 object-contain" />
            </div>
            <span className="font-semibold">Lumina</span>
          </div>
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            {isSidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </header>

        <main className="flex-1 overflow-hidden z-0">
          {children}
        </main>
      </div>
    </div>
  );
}
