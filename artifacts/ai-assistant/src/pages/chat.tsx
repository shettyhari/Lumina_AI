import { useState, useRef, useEffect, useMemo } from "react";
import { useParams, Link, useLocation } from "wouter";
import {
  useGetGeminiConversation,
  getGetGeminiConversationQueryKey,
  useListGeminiMessages,
  getListGeminiMessagesQueryKey,
  useUpdateGeminiConversation,
  useDeleteGeminiConversation,
  useGetUserProfile,
  getGetUserProfileQueryKey,
  useCreateGeminiConversation,
  useListModels,
  getListModelsQueryKey,
  useListUserApiKeys,
  getListUserApiKeysQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Send, Sparkles, MoreVertical, Trash2, Edit2, Pin, ChevronDown, AlertTriangle, Bot } from "lucide-react";
import { SiAnthropic, SiGoogle } from "react-icons/si";
import { Link as WouterLink } from "wouter";
import { cn } from "@/lib/utils";

// ─── Provider badge ───────────────────────────────────────────────────────────

const PROVIDER_ICONS: Record<string, React.ReactNode> = {
  gemini: <SiGoogle className="w-3 h-3" />,
  openai: <Bot className="w-3 h-3" />,
  anthropic: <span className="text-[10px] font-bold leading-none">A</span>,
  openrouter: <span className="text-[10px] font-bold leading-none">OR</span>,
};

const PROVIDER_COLORS: Record<string, string> = {
  gemini: "text-primary bg-primary/10",
  openai: "text-green-400 bg-green-400/10",
  anthropic: "text-orange-400 bg-orange-400/10",
  openrouter: "text-purple-400 bg-purple-400/10",
};

// ─── Model Selector ───────────────────────────────────────────────────────────

function ModelSelector({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  const { data: models } = useListModels({ query: { queryKey: getListModelsQueryKey() } });
  const { data: apiKeys } = useListUserApiKeys({ query: { queryKey: getListUserApiKeysQueryKey() } });
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const configuredProviders = useMemo(() => {
    const set = new Set<string>(["gemini"]);
    apiKeys?.forEach(k => set.add(k.provider));
    return set;
  }, [apiKeys]);

  const currentModel = models?.find(m => m.id === value);

  // Group models
  const groups = useMemo(() => {
    if (!models) return [];
    const providerOrder = ["gemini", "openai", "anthropic", "openrouter"];
    return providerOrder.map(provider => ({
      provider,
      models: models.filter(m => m.provider === provider),
      available: configuredProviders.has(provider),
    })).filter(g => g.models.length > 0);
  }, [models, configuredProviders]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const providerLabel: Record<string, string> = {
    gemini: "Google Gemini",
    openai: "OpenAI",
    anthropic: "Anthropic",
    openrouter: "OpenRouter",
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        data-testid="button-model-selector"
        className={cn(
          "flex items-center gap-1.5 text-xs font-medium rounded-lg px-2.5 py-1.5 transition-colors",
          currentModel ? PROVIDER_COLORS[currentModel.provider] : "text-muted-foreground bg-muted/20",
          disabled ? "opacity-50 cursor-not-allowed" : "hover:opacity-80 cursor-pointer"
        )}
      >
        {currentModel && PROVIDER_ICONS[currentModel.provider]}
        <span className="max-w-[120px] truncate">{currentModel?.name ?? value}</span>
        <ChevronDown className={cn("w-3 h-3 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute bottom-full mb-2 left-0 w-72 bg-popover border border-popover-border rounded-xl shadow-2xl py-1 z-50 animate-in fade-in zoom-in-95 duration-150 max-h-80 overflow-y-auto">
          {groups.map(group => (
            <div key={group.provider}>
              <div className="px-3 py-1.5 flex items-center gap-1.5">
                <span className={cn("flex items-center justify-center w-4 h-4", PROVIDER_COLORS[group.provider].split(" ")[0])}>
                  {PROVIDER_ICONS[group.provider]}
                </span>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {providerLabel[group.provider]}
                </span>
                {!group.available && (
                  <span className="ml-auto text-[10px] text-muted-foreground bg-muted/20 px-1.5 py-0.5 rounded-full">Key required</span>
                )}
              </div>
              {group.models.map(model => (
                <button
                  key={model.id}
                  onClick={() => {
                    if (!group.available) return;
                    onChange(model.id);
                    setOpen(false);
                  }}
                  disabled={!group.available}
                  data-testid={`option-model-${model.id}`}
                  className={cn(
                    "w-full text-left px-3 py-2.5 transition-colors",
                    value === model.id ? "bg-primary/10 text-primary" : "text-foreground hover:bg-accent",
                    !group.available && "opacity-40 cursor-not-allowed"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{model.name}</span>
                    {value === model.id && <span className="text-xs text-primary">Active</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{model.description}</p>
                  {model.contextWindow && (
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                      {(model.contextWindow / 1000).toFixed(0)}K context
                    </p>
                  )}
                </button>
              ))}
              {!group.available && (
                <div className="px-3 pb-2">
                  <WouterLink href="/settings">
                    <span className="text-xs text-primary hover:underline cursor-pointer">
                      Add {providerLabel[group.provider]} key in Settings →
                    </span>
                  </WouterLink>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

const MessageBubble = ({ role, content, isStreaming }: { role: string; content: string; isStreaming?: boolean }) => {
  const isUser = role === "user";
  return (
    <div className={cn("flex w-full mb-6", isUser ? "justify-end" : "justify-start")}>
      <div className={cn(
        "max-w-[85%] rounded-2xl px-5 py-4 whitespace-pre-wrap break-words leading-relaxed",
        isUser
          ? "bg-primary/20 text-foreground border border-primary/20"
          : "bg-card text-card-foreground border border-border shadow-sm",
      )}>
        {isUser ? content : (
          <div className="prose prose-sm dark:prose-invert max-w-none text-foreground prose-p:leading-relaxed prose-pre:bg-black/50 prose-pre:border prose-pre:border-white/10">
            {content || (isStreaming ? <span className="animate-pulse text-muted-foreground">...</span> : "")}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Empty state suggestions ──────────────────────────────────────────────────

const SUGGESTIONS = [
  "Explain quantum computing simply",
  "Write a Python script to sort a CSV",
  "What are the key differences between React and Vue?",
  "Help me outline a business plan for a SaaS product",
];

// ─── Main Chat Page ───────────────────────────────────────────────────────────

export default function ChatPage() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const conversationId = id ? parseInt(id) : null;
  const isNew = !conversationId;

  const [input, setInput] = useState("");
  const [model, setModel] = useState("gemini-2.5-flash");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [showOptions, setShowOptions] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [streamError, setStreamError] = useState<{ message: string; provider?: string } | null>(null);

  const { data: profile } = useGetUserProfile({ query: { queryKey: getGetUserProfileQueryKey() } });
  const { data: conversation } = useGetGeminiConversation(conversationId!, {
    query: { enabled: !!conversationId, queryKey: getGetGeminiConversationQueryKey(conversationId!) },
  });
  const { data: messages } = useListGeminiMessages(conversationId!, {
    query: { enabled: !!conversationId, queryKey: getListGeminiMessagesQueryKey(conversationId!) },
  });

  const updateConversation = useUpdateGeminiConversation();
  const deleteConversation = useDeleteGeminiConversation();
  const createConversation = useCreateGeminiConversation();

  useEffect(() => {
    if (profile?.preferredModel && isNew) setModel(profile.preferredModel);
  }, [profile, isNew]);

  useEffect(() => {
    if (conversation) setEditTitle(conversation.title);
  }, [conversation]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  const handleSend = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || isStreaming) return;

    let targetConvId = conversationId;
    setStreamError(null);

    if (!targetConvId) {
      try {
        const newConv = await createConversation.mutateAsync({
          data: { title: msg.slice(0, 50) + (msg.length > 50 ? "..." : "") },
        });
        targetConvId = newConv.id;
        window.history.pushState(null, "", `${import.meta.env.BASE_URL}chat/${newConv.id}`.replace("//", "/"));
      } catch {
        return;
      }
    }

    const userMessage = msg;
    setInput("");
    setIsStreaming(true);
    setStreamingContent("");

    if (conversationId && messages) {
      queryClient.setQueryData(getListGeminiMessagesQueryKey(conversationId), [
        ...messages,
        { id: Date.now(), conversationId, role: "user", content: userMessage, imageData: null, createdAt: new Date().toISOString() },
      ]);
    }

    try {
      const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
      const response = await fetch(`${basePath}/api/gemini/conversations/${targetConvId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: userMessage, model, systemPrompt: profile?.systemPrompt || undefined }),
        credentials: "include",
      });

      if (response.status === 402) {
        const body = await response.json();
        setStreamError({ message: body.error, provider: body.provider });
        setIsStreaming(false);
        return;
      }

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.done) break;
              if (data.error) setStreamError({ message: data.error });
              if (data.content) setStreamingContent(prev => prev + data.content);
            } catch { /* ignore */ }
          }
        }
      }
    } catch (error) {
      console.error("Streaming error:", error);
      setStreamError({ message: "Connection failed. Please try again." });
    } finally {
      setIsStreaming(false);
      if (targetConvId) {
        queryClient.invalidateQueries({ queryKey: getListGeminiMessagesQueryKey(targetConvId) });
        queryClient.invalidateQueries({ queryKey: ["/api/gemini/conversations"] });
        queryClient.invalidateQueries({ queryKey: ["/api/user/stats"] });
        if (!conversationId) setLocation(`/chat/${targetConvId}`);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const togglePin = () => {
    if (!conversationId || !conversation) return;
    updateConversation.mutate(
      { id: conversationId, data: { pinned: !conversation.pinned } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetGeminiConversationQueryKey(conversationId) }) },
    );
    setShowOptions(false);
  };

  const saveTitle = () => {
    if (!conversationId || !editTitle.trim()) { setIsEditingTitle(false); return; }
    updateConversation.mutate(
      { id: conversationId, data: { title: editTitle } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetGeminiConversationQueryKey(conversationId) }) },
    );
    setIsEditingTitle(false);
  };

  const handleDelete = () => {
    if (!conversationId) return;
    if (confirm("Delete this conversation?")) {
      deleteConversation.mutate({ id: conversationId }, { onSuccess: () => setLocation("/chat") });
    }
  };

  return (
    <div className="flex flex-col h-full w-full">

      {/* Header */}
      {!isNew && conversation && (
        <header className="shrink-0 h-14 border-b border-border/50 px-6 flex items-center justify-between bg-background/50 backdrop-blur-sm z-10">
          <div className="flex-1 min-w-0 mr-4">
            {isEditingTitle ? (
              <input
                type="text" value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                onBlur={saveTitle} onKeyDown={e => e.key === "Enter" && saveTitle()}
                autoFocus
                className="bg-input/50 border border-primary/50 rounded px-2 py-1 text-sm text-foreground w-full max-w-xs focus:outline-none"
              />
            ) : (
              <h2
                className="font-medium truncate text-foreground flex items-center gap-2 cursor-text hover:text-primary transition-colors"
                onClick={() => setIsEditingTitle(true)}
              >
                {conversation.pinned && <Pin className="w-3.5 h-3.5 text-primary" />}
                {conversation.title}
              </h2>
            )}
          </div>
          <div className="relative">
            <button
              onClick={() => setShowOptions(!showOptions)}
              data-testid="button-conversation-options"
              className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            {showOptions && (
              <div className="absolute right-0 mt-1 w-48 bg-popover border border-popover-border rounded-xl shadow-xl py-1 z-50 animate-in fade-in zoom-in duration-200">
                <button onClick={togglePin} className="w-full text-left px-4 py-2 text-sm text-foreground hover:bg-accent flex items-center gap-2">
                  <Pin className="w-4 h-4" /> {conversation.pinned ? "Unpin" : "Pin to sidebar"}
                </button>
                <button onClick={() => { setIsEditingTitle(true); setShowOptions(false); }} className="w-full text-left px-4 py-2 text-sm text-foreground hover:bg-accent flex items-center gap-2">
                  <Edit2 className="w-4 h-4" /> Rename
                </button>
                <button onClick={handleDelete} className="w-full text-left px-4 py-2 text-sm text-destructive hover:bg-destructive/10 flex items-center gap-2">
                  <Trash2 className="w-4 h-4" /> Delete
                </button>
              </div>
            )}
          </div>
        </header>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 md:px-8 py-6">
        {isNew && !streamingContent && (
          <div className="h-full flex flex-col items-center justify-center max-w-2xl mx-auto text-center gap-6">
            <div className="space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-7 h-7 text-primary" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight">What's on your mind?</h2>
              <p className="text-muted-foreground">Start a conversation or pick a suggestion below.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => handleSend(s)}
                  data-testid={`suggestion-${s.slice(0, 20).replace(/\s+/g, "-").toLowerCase()}`}
                  className="text-left text-sm bg-card/50 border border-border/50 hover:border-primary/40 hover:bg-primary/5 rounded-xl px-4 py-3 transition-all text-muted-foreground hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="max-w-3xl mx-auto">
          {messages?.map(msg => (
            <MessageBubble key={msg.id} role={msg.role} content={msg.content} />
          ))}
          {isStreaming && (
            <MessageBubble role="assistant" content={streamingContent} isStreaming={!streamingContent} />
          )}

          {/* Error banner */}
          {streamError && (
            <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-3 mb-4 animate-in fade-in">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-destructive">{streamError.message}</p>
                {streamError.provider && (
                  <Link href="/settings">
                    <span className="text-xs text-primary hover:underline cursor-pointer mt-1 block">
                      Go to Settings → AI Providers to add your {streamError.provider} key →
                    </span>
                  </Link>
                )}
              </div>
              <button onClick={() => setStreamError(null)} className="text-muted-foreground hover:text-foreground text-xs">✕</button>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input bar */}
      <div className="shrink-0 px-4 md:px-8 pb-6 pt-2">
        <div className="max-w-3xl mx-auto">
          <form
            onSubmit={e => { e.preventDefault(); handleSend(); }}
            className="relative bg-card/80 backdrop-blur-sm border border-border/60 rounded-2xl shadow-lg focus-within:border-primary/50 focus-within:shadow-primary/10 focus-within:shadow-lg transition-all"
          >
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything..."
              rows={1}
              disabled={isStreaming}
              data-testid="textarea-chat-input"
              className="w-full bg-transparent px-5 pt-4 pb-14 resize-none focus:outline-none text-foreground placeholder:text-muted-foreground text-sm leading-relaxed max-h-48 scrollbar-thin"
              style={{ height: "auto" }}
              onInput={e => {
                const t = e.currentTarget;
                t.style.height = "auto";
                t.style.height = Math.min(t.scrollHeight, 192) + "px";
              }}
            />
            <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between">
              <ModelSelector value={model} onChange={setModel} disabled={isStreaming} />
              <button
                type="submit"
                disabled={!input.trim() || isStreaming}
                data-testid="button-send-message"
                className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {isStreaming ? (
                  <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>
          </form>
          <p className="text-center text-xs text-muted-foreground/50 mt-2">
            Lumina may make mistakes — always verify important information.
          </p>
        </div>
      </div>
    </div>
  );
}
