import { useState, useRef, useEffect, useCallback } from "react";
import {
  useListFamilyRoomMessages,
  getListFamilyRoomMessagesQueryKey,
  useSendFamilyRoomMessage,
  useListFamilyMembers,
} from "@workspace/api-client-react";
import { FamilyRoomMessageEnriched } from "@workspace/api-client-react";
import { useUser } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { Users, Send, Bot } from "lucide-react";
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

function Avatar({ name, url, size = 8 }: { name: string; url?: string | null; size?: number }) {
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return url ? (
    <img src={url} alt={name} className={`h-${size} w-${size} rounded-full object-cover shrink-0`} />
  ) : (
    <div className={`h-${size} w-${size} rounded-full bg-primary/20 flex items-center justify-center shrink-0 text-primary font-semibold text-xs`}>
      {initials}
    </div>
  );
}

function MessageBubble({ msg, isOwn }: { msg: FamilyRoomMessageEnriched; isOwn: boolean }) {
  const isAi = msg.role === "assistant";
  return (
    <div className={cn("flex gap-3 items-end", isOwn && "flex-row-reverse")}>
      <div className="shrink-0">
        {isAi ? (
          <div className="h-8 w-8 rounded-full bg-iridescent flex items-center justify-center">
            <Bot className="h-4 w-4 text-white" />
          </div>
        ) : (
          <Avatar name={msg.senderName} url={msg.senderAvatarUrl} size={8} />
        )}
      </div>
      <div className={cn("flex flex-col gap-1 max-w-[70%]", isOwn && "items-end")}>
        <span className="text-xs text-muted-foreground px-1">
          {isOwn ? "You" : msg.senderName}
        </span>
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
            isOwn
              ? "bg-primary text-primary-foreground rounded-br-sm"
              : isAi
              ? "bg-sidebar border border-sidebar-border rounded-bl-sm"
              : "bg-card border border-border rounded-bl-sm"
          )}
        >
          {msg.content}
        </div>
        <span className="text-[10px] text-muted-foreground/60 px-1">
          {timeAgo(msg.createdAt as unknown as string)}
        </span>
      </div>
    </div>
  );
}

export default function FamilyRoomPage() {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [latestId, setLatestId] = useState<number | undefined>();

  // Initial load
  const { data: initialMsgs, isLoading } = useListFamilyRoomMessages(
    {},
    { query: { queryKey: getListFamilyRoomMessagesQueryKey() } }
  );

  const [allMessages, setAllMessages] = useState<FamilyRoomMessageEnriched[]>([]);

  useEffect(() => {
    if (initialMsgs && allMessages.length === 0) {
      setAllMessages(initialMsgs);
      if (initialMsgs.length > 0) {
        setLatestId(initialMsgs[initialMsgs.length - 1].id);
      }
    }
  }, [initialMsgs]);

  // Poll for new messages every 10s
  const pollNew = useCallback(async () => {
    if (latestId === undefined && allMessages.length === 0) return;
    const after = latestId ?? 0;
    try {
      const res = await fetch(
        `${import.meta.env.BASE_URL}api/family/room/messages?after=${after}`.replace("//", "/"),
        { credentials: "include" }
      );
      if (!res.ok) return;
      const newMsgs: FamilyRoomMessageEnriched[] = await res.json();
      if (newMsgs.length > 0) {
        setAllMessages((prev) => [...prev, ...newMsgs]);
        setLatestId(newMsgs[newMsgs.length - 1].id);
      }
    } catch { /* ignore */ }
  }, [latestId, allMessages.length]);

  useEffect(() => {
    const id = setInterval(pollNew, 10_000);
    return () => clearInterval(id);
  }, [pollNew]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [allMessages]);

  const { data: members } = useListFamilyMembers({});
  const sendMsg = useSendFamilyRoomMessage();

  const handleSend = () => {
    const text = input.trim();
    if (!text || sendMsg.isPending) return;
    setInput("");

    sendMsg.mutate(
      { data: { content: text } },
      {
        onSuccess: (data) => {
          setAllMessages((prev) => {
            const newMsgs = [data.message];
            if (data.aiMessage) newMsgs.push(data.aiMessage);
            const combined = [...prev, ...newMsgs];
            // deduplicate by id
            const seen = new Set<number>();
            const deduped = combined.filter((m) => { if (seen.has(m.id)) return false; seen.add(m.id); return true; });
            return deduped;
          });
          if (data.aiMessage) {
            setLatestId(data.aiMessage.id);
          } else {
            setLatestId(data.message.id);
          }
          queryClient.invalidateQueries({ queryKey: getListFamilyRoomMessagesQueryKey() });
        },
      }
    );
  };

  return (
    <div className="flex h-full">
      {/* Chat area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border/50 bg-background/50 backdrop-blur-xl shrink-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10">
            <Users className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h1 className="font-semibold text-foreground">Family Room</h1>
            <p className="text-xs text-muted-foreground">
              {members?.length ?? 0} member{(members?.length ?? 0) !== 1 ? "s" : ""} · mention @Lina for AI help
            </p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scrollbar-thin">
          {isLoading && allMessages.length === 0 && (
            <div className="flex justify-center py-8">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          )}
          {!isLoading && allMessages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                <Users className="h-8 w-8 text-primary/60" />
              </div>
              <p className="text-muted-foreground text-sm">
                No messages yet. Say hello to the family!
              </p>
              <p className="text-muted-foreground/60 text-xs mt-1">
                Tip: mention @Lina to get AI assistance in the chat.
              </p>
            </div>
          )}
          {allMessages.map((msg) => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              isOwn={msg.clerkUserId === user?.id}
            />
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="shrink-0 border-t border-border/50 px-4 py-3 bg-background/50">
          <div className="flex items-end gap-2 rounded-xl border border-border bg-card px-3 py-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
              }}
              placeholder="Message the family… (mention @Lina for AI help)"
              rows={1}
              className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none max-h-32 py-1"
              style={{ minHeight: "1.5rem" }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sendMsg.isPending}
              className="shrink-0 flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Member roster sidebar (desktop) */}
      <div className="hidden lg:flex w-56 flex-col border-l border-border/50 bg-sidebar/50 p-4 gap-3 shrink-0">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Members</p>
        {members?.map((m) => (
          <div key={m.clerkUserId} className="flex items-center gap-2">
            <Avatar name={m.displayName ?? m.email ?? "?"} url={m.avatarUrl} size={7} />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {m.displayName ?? m.email?.split("@")[0] ?? "Member"}
              </p>
              <p className="text-[10px] text-muted-foreground capitalize">{m.role}</p>
            </div>
          </div>
        ))}
        {!members?.length && (
          <p className="text-xs text-muted-foreground">Loading…</p>
        )}
        <div className="mt-auto pt-4 border-t border-border/50">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-iridescent flex items-center justify-center">
              <Bot className="h-3.5 w-3.5 text-white" />
            </div>
            <div>
              <p className="text-xs font-medium text-foreground">Lina</p>
              <p className="text-[10px] text-muted-foreground">AI Assistant</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
