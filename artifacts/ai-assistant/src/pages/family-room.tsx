import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  useListFamilyRoomMessages,
  getListFamilyRoomMessagesQueryKey,
  useSendFamilyRoomMessage,
  useListFamilyMembers,
} from "@workspace/api-client-react";
import { FamilyRoomMessageEnriched } from "@workspace/api-client-react";
import { useUser } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { Users, Send, Bot, AtSign } from "lucide-react";
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

  // Render message content with highlighted @mentions
  const renderContent = (text: string) => {
    const parts = text.split(/(@\w[\w\s]*)/g);
    return parts.map((part, i) =>
      part.startsWith("@") ? (
        <span key={i} className="text-primary font-medium">{part}</span>
      ) : (
        <span key={i}>{part}</span>
      )
    );
  };

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
          {renderContent(msg.content)}
        </div>
        <span className="text-[10px] text-muted-foreground/60 px-1">
          {timeAgo(msg.createdAt as unknown as string)}
        </span>
      </div>
    </div>
  );
}

type MentionItem = {
  id: string;
  name: string;
  role?: string;
  avatarUrl?: string | null;
  isAi?: boolean;
};

function MentionDropdown({
  items,
  query,
  selectedIndex,
  onSelect,
}: {
  items: MentionItem[];
  query: string;
  selectedIndex: number;
  onSelect: (item: MentionItem) => void;
}) {
  const filtered = useMemo(
    () =>
      items.filter((item) =>
        item.name.toLowerCase().includes(query.toLowerCase())
      ),
    [items, query]
  );

  if (filtered.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border border-border bg-card shadow-lg overflow-hidden z-50">
      <div className="px-2 py-1.5 border-b border-border/50">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
          <AtSign className="h-3 w-3" /> Mention
        </p>
      </div>
      <div className="max-h-48 overflow-y-auto">
        {filtered.map((item, i) => (
          <button
            key={item.id}
            className={cn(
              "w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-accent transition-colors",
              i === selectedIndex && "bg-accent"
            )}
            onMouseDown={(e) => {
              e.preventDefault(); // don't blur textarea
              onSelect(item);
            }}
          >
            {item.isAi ? (
              <div className="h-7 w-7 rounded-full bg-iridescent flex items-center justify-center shrink-0">
                <Bot className="h-3.5 w-3.5 text-white" />
              </div>
            ) : (
              <Avatar name={item.name} url={item.avatarUrl} size={7} />
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
              <p className="text-[10px] text-muted-foreground capitalize">
                {item.isAi ? "AI Assistant" : item.role ?? "member"}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function FamilyRoomPage() {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [latestId, setLatestId] = useState<number | undefined>();

  // @mention state
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStart, setMentionStart] = useState<number>(-1);
  const [mentionSelectedIdx, setMentionSelectedIdx] = useState(0);

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

  // Build the mention items list: Lina first, then family members
  const mentionItems = useMemo<MentionItem[]>(() => {
    const lina: MentionItem = { id: "lina", name: "Lina", isAi: true };
    const memberItems: MentionItem[] = (members ?? []).map((m) => ({
      id: m.clerkUserId,
      name: m.displayName ?? m.email?.split("@")[0] ?? "Member",
      role: m.role,
      avatarUrl: m.avatarUrl,
    }));
    return [lina, ...memberItems];
  }, [members]);

  const filteredMentions = useMemo(
    () =>
      mentionItems.filter((item) =>
        item.name.toLowerCase().includes(mentionQuery.toLowerCase())
      ),
    [mentionItems, mentionQuery]
  );

  // Handle textarea input — detect @mention trigger
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const cursor = e.target.selectionStart ?? val.length;
    setInput(val);

    // Find the last @ before the cursor that hasn't been closed by a space
    const textBeforeCursor = val.slice(0, cursor);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);
    if (atMatch) {
      setMentionOpen(true);
      setMentionQuery(atMatch[1]);
      setMentionStart(cursor - atMatch[0].length);
      setMentionSelectedIdx(0);
    } else {
      setMentionOpen(false);
      setMentionQuery("");
      setMentionStart(-1);
    }
  };

  const insertMention = useCallback(
    (item: MentionItem) => {
      const before = input.slice(0, mentionStart);
      const after = input.slice(mentionStart + 1 + mentionQuery.length);
      const mention = `@${item.name} `;
      const newVal = before + mention + after;
      setInput(newVal);
      setMentionOpen(false);
      setMentionQuery("");
      setMentionStart(-1);

      // Restore focus and move cursor to after the inserted mention
      setTimeout(() => {
        if (textareaRef.current) {
          const newCursor = before.length + mention.length;
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(newCursor, newCursor);
        }
      }, 0);
    },
    [input, mentionStart, mentionQuery]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionOpen && filteredMentions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionSelectedIdx((i) => (i + 1) % filteredMentions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionSelectedIdx((i) => (i - 1 + filteredMentions.length) % filteredMentions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(filteredMentions[mentionSelectedIdx]);
        return;
      }
      if (e.key === "Escape") {
        setMentionOpen(false);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    const text = input.trim();
    if (!text || sendMsg.isPending) return;
    setInput("");
    setMentionOpen(false);

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
              {members?.length ?? 0} member{(members?.length ?? 0) !== 1 ? "s" : ""} · type @ to mention someone
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
                Tip: type <span className="text-primary font-medium">@Lina</span> to get AI help, or <span className="text-primary font-medium">@Name</span> to mention a family member.
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
          <div className="relative flex items-end gap-2 rounded-xl border border-border bg-card px-3 py-2">
            {mentionOpen && (
              <MentionDropdown
                items={mentionItems}
                query={mentionQuery}
                selectedIndex={mentionSelectedIdx}
                onSelect={insertMention}
              />
            )}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Message the family… (type @ to mention)"
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
          <button
            key={m.clerkUserId}
            className="flex items-center gap-2 text-left hover:opacity-80 transition-opacity"
            onClick={() => {
              const name = m.displayName ?? m.email?.split("@")[0] ?? "Member";
              const mention = `@${name} `;
              setInput((prev) => prev + mention);
              textareaRef.current?.focus();
            }}
          >
            <Avatar name={m.displayName ?? m.email ?? "?"} url={m.avatarUrl} size={7} />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {m.displayName ?? m.email?.split("@")[0] ?? "Member"}
              </p>
              <p className="text-[10px] text-muted-foreground capitalize">{m.role}</p>
            </div>
          </button>
        ))}
        {!members?.length && (
          <p className="text-xs text-muted-foreground">Loading…</p>
        )}
        <div className="mt-auto pt-4 border-t border-border/50">
          <button
            className="flex items-center gap-2 hover:opacity-80 transition-opacity w-full text-left"
            onClick={() => {
              setInput((prev) => prev + "@Lina ");
              textareaRef.current?.focus();
            }}
          >
            <div className="h-7 w-7 rounded-full bg-iridescent flex items-center justify-center">
              <Bot className="h-3.5 w-3.5 text-white" />
            </div>
            <div>
              <p className="text-xs font-medium text-foreground">Lina</p>
              <p className="text-[10px] text-muted-foreground">AI Assistant</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
