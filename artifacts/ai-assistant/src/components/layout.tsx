import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { useClerk, useUser } from "@clerk/react";
import {
  MessageSquare, Image as ImageIcon, LayoutDashboard, Settings,
  Plus, Pin, Menu, X, MessageCircle, LogOut, Brain, Sparkles, Shield,
  Bell, Users, ShoppingCart, CheckSquare, Calendar, ChefHat,
  StickyNote, DollarSign, PhoneCall, CloudSun, FolderOpen,
  Wrench, Receipt, Package, Trophy, Gift, PawPrint, ShoppingBasket,
  Sun, Camera, Cloud, ChevronDown, Bot, Home, Banknote,
  BookOpen, Newspaper,
} from "lucide-react";
import {
  useGetRecentActivity, getGetRecentActivityQueryKey,
  useGetPinnedConversations, getGetPinnedConversationsQueryKey,
  useCreateGeminiConversation,
  useGetFamilyNotificationCount,
} from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { useFamilyStatus } from "@/contexts/family-context";
import { NotificationDrawer } from "./notification-drawer";

// ─── Category definitions ────────────────────────────────────────────────────

const categories = [
  {
    label: "AI & Tools",
    icon: Bot,
    items: [
      { href: "/chat",      icon: MessageSquare, label: "Chat" },
      { href: "/image-gen", icon: ImageIcon,     label: "Image Gen" },
      { href: "/memory",    icon: Brain,         label: "Memory" },
      { href: "/personas",  icon: Sparkles,      label: "Personas" },
    ],
  },
  {
    label: "Family",
    icon: Users,
    items: [
      { href: "/family-room", icon: Users,       label: "Family Room" },
      { href: "/chores",      icon: CheckSquare, label: "Chores" },
      { href: "/rewards",     icon: Trophy,      label: "Rewards" },
      { href: "/wishlist",    icon: Gift,        label: "Wishlist" },
    ],
  },
  {
    label: "Daily Life",
    icon: Home,
    items: [
      { href: "/briefing",   icon: Sun,          label: "Briefing" },
      { href: "/calendar",   icon: Calendar,     label: "Calendar" },
      { href: "/reminders",  icon: Bell,         label: "Reminders" },
      { href: "/meals",      icon: ChefHat,      label: "Meals" },
      { href: "/shopping",   icon: ShoppingCart, label: "Shopping" },
      { href: "/pantry",     icon: ShoppingBasket, label: "Pantry" },
      { href: "/pets",       icon: PawPrint,     label: "Pets" },
    ],
  },
  {
    label: "Finance",
    icon: Banknote,
    items: [
      { href: "/budget", icon: DollarSign, label: "Budget" },
      { href: "/bills",  icon: Receipt,    label: "Bills" },
    ],
  },
  {
    label: "Home & Property",
    icon: Wrench,
    items: [
      { href: "/maintenance", icon: Wrench,  label: "Maintenance" },
      { href: "/inventory",   icon: Package, label: "Inventory" },
    ],
  },
  {
    label: "Files & Media",
    icon: FolderOpen,
    items: [
      { href: "/notes",          icon: StickyNote, label: "Notes" },
      { href: "/documents",      icon: FolderOpen, label: "Documents" },
      { href: "/photos",         icon: Camera,     label: "Photos" },
      { href: "/cloud-storage",  icon: Cloud,      label: "Cloud Storage" },
    ],
  },
  {
    label: "Information",
    icon: BookOpen,
    items: [
      { href: "/weather",   icon: CloudSun, label: "Weather" },
      { href: "/emergency", icon: PhoneCall, label: "Emergency" },
    ],
  },
];

// Top-level items always visible (not in a collapsible group)
const topItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/settings",  icon: Settings,        label: "Settings" },
];

// ─── NavLink helper ───────────────────────────────────────────────────────────

function NavLink({
  href, icon: Icon, label, active, indent = false, onClick,
}: {
  href: string; icon: React.ElementType; label: string;
  active: boolean; indent?: boolean; onClick?: () => void;
}) {
  return (
    <Link href={href} onClick={onClick}>
      <div className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all cursor-pointer",
        indent && "pl-7",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground",
      )}>
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
    </Link>
  );
}

// ─── Collapsible category ─────────────────────────────────────────────────────

function CategorySection({
  label, icon: Icon, items, location, defaultOpen, onClose,
}: {
  label: string; icon: React.ElementType;
  items: { href: string; icon: React.ElementType; label: string }[];
  location: string; defaultOpen: boolean; onClose: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider hover:text-muted-foreground transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </div>
        <ChevronDown className={cn(
          "h-3 w-3 transition-transform duration-200",
          open ? "rotate-0" : "-rotate-90",
        )} />
      </button>

      {open && (
        <div className="mt-0.5 space-y-0.5">
          {items.map(item => (
            <NavLink
              key={item.href}
              href={item.href}
              icon={item.icon}
              label={item.label}
              active={location === item.href}
              indent
              onClick={onClose}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main layout ──────────────────────────────────────────────────────────────

export default function Layout({ children }: { children: ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [location, setLocation] = useLocation();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { isAdmin } = useFamilyStatus();

  const { data: recentActivity } = useGetRecentActivity({ query: { queryKey: getGetRecentActivityQueryKey() } });
  const { data: pinnedConversations } = useGetPinnedConversations({ query: { queryKey: getGetPinnedConversationsQueryKey() } });
  const createConversation = useCreateGeminiConversation();
  const { data: notifCount } = useGetFamilyNotificationCount({
    query: { queryKey: ["/api/family/notifications/count"], refetchInterval: 10_000 },
  });
  const unreadCount = notifCount?.count ?? 0;

  const handleNewChat = () => {
    createConversation.mutate(
      { data: { title: "New Conversation" } },
      { onSuccess: (data) => { setLocation(`/chat/${data.id}`); setIsSidebarOpen(false); } },
    );
  };

  const closeSidebar = () => setIsSidebarOpen(false);

  const SidebarContent = () => (
    <div className="flex h-full flex-col bg-sidebar border-r border-sidebar-border">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-iridescent shadow-lg">
          <img
            src={`${import.meta.env.BASE_URL}logo.svg`.replace('//', '/')}
            alt="Logo"
            className="w-5 h-5 object-contain filter drop-shadow-md"
          />
        </div>
        <span className="text-lg font-semibold tracking-tight text-foreground">Lina</span>
      </div>

      {/* New Chat */}
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

      {/* Scrollable nav */}
      <div className="flex-1 overflow-y-auto py-3 scrollbar-thin">
        <div className="px-4 space-y-0.5 mb-4">
          {/* Top-level items */}
          {topItems.map(item => (
            <NavLink
              key={item.href}
              href={item.href}
              icon={item.icon}
              label={item.label}
              active={location === item.href}
              onClick={closeSidebar}
            />
          ))}
        </div>

        {/* Divider */}
        <div className="mx-4 mb-3 border-t border-sidebar-border/50" />

        {/* Category sections */}
        <div className="px-4 space-y-3">
          {categories.map(cat => {
            const isActiveCategory = cat.items.some(i =>
              location === i.href || (i.href === '/chat' && location.startsWith('/chat'))
            );
            return (
              <CategorySection
                key={cat.label}
                label={cat.label}
                icon={cat.icon}
                items={cat.items}
                location={location}
                defaultOpen={isActiveCategory}
                onClose={closeSidebar}
              />
            );
          })}

          {/* Admin */}
          {isAdmin && (
            <NavLink
              href="/admin"
              icon={Shield}
              label="Admin Panel"
              active={location === "/admin"}
              onClick={closeSidebar}
            />
          )}
        </div>

        {/* Pinned conversations */}
        {pinnedConversations && pinnedConversations.length > 0 && (
          <div className="mt-4 px-4">
            <div className="mx-0 mb-3 border-t border-sidebar-border/50" />
            <h3 className="mb-1.5 px-3 text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider flex items-center gap-2">
              <Pin className="h-3 w-3" /> Pinned
            </h3>
            <div className="space-y-0.5">
              {pinnedConversations.map(conv => (
                <Link key={conv.id} href={`/chat/${conv.id}`} onClick={closeSidebar}>
                  <div className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors cursor-pointer",
                    location === `/chat/${conv.id}`
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground",
                  )}>
                    <Pin className="h-3.5 w-3.5 shrink-0 opacity-60" />
                    <span className="truncate">{conv.title}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Recent conversations */}
        {recentActivity && recentActivity.length > 0 && (
          <div className="mt-4 px-4">
            <h3 className="mb-1.5 px-3 text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider flex items-center gap-2">
              <MessageCircle className="h-3 w-3" /> Recent
            </h3>
            <div className="space-y-0.5">
              {recentActivity.map(conv => (
                <Link key={conv.id} href={`/chat/${conv.id}`} onClick={closeSidebar}>
                  <div className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors cursor-pointer",
                    location === `/chat/${conv.id}`
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground",
                  )}>
                    <MessageCircle className="h-3.5 w-3.5 shrink-0 opacity-60" />
                    <span className="truncate">{conv.title}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer: user + actions */}
      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center justify-between gap-3 px-2 py-2">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="relative">
              <img
                src={user?.imageUrl}
                alt={user?.fullName || "User"}
                className="h-8 w-8 rounded-full border border-border"
              />
              {isAdmin && (
                <div className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary ring-2 ring-sidebar">
                  <Shield className="h-2 w-2 text-primary-foreground" />
                </div>
              )}
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="truncate text-sm font-medium text-foreground">{user?.fullName}</span>
              <span className="truncate text-xs text-muted-foreground">
                {isAdmin ? "Family Admin" : user?.primaryEmailAddress?.emailAddress}
              </span>
            </div>
          </div>

          <button
            onClick={() => setNotifOpen(true)}
            className="relative rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors shrink-0"
            title="Notifications"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground leading-none">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

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
      <NotificationDrawer open={notifOpen} onClose={() => setNotifOpen(false)} />

      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm md:hidden"
          onClick={closeSidebar}
        />
      )}

      <div className={cn(
        "fixed inset-y-0 left-0 z-50 w-72 transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full",
      )}>
        <SidebarContent />
      </div>

      <div className="flex flex-1 flex-col overflow-hidden relative">
        <div className="absolute inset-0 bg-iridescent opacity-5 pointer-events-none blur-[100px] mix-blend-screen" />

        <header className="flex h-14 items-center justify-between border-b border-border/50 bg-background/50 px-4 backdrop-blur-xl md:hidden z-10">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-iridescent">
              <img
                src={`${import.meta.env.BASE_URL}logo.svg`.replace('//', '/')}
                alt="Logo"
                className="w-3.5 h-3.5 object-contain"
              />
            </div>
            <span className="font-semibold">Lina</span>
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
