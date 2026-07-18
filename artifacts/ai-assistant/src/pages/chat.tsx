import { useState, useRef, useEffect, useMemo, useCallback } from "react";
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
  useExportConversation,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Send, Sparkles, MoreVertical, Trash2, Edit2, Pin, ChevronDown,
  AlertTriangle, Bot, Mic, Paperclip, X, Brain, Download, Image as ImageIcon
} from "lucide-react";
import { SiAnthropic, SiGoogle } from "react-icons/si";
import { Link as WouterLink } from "wouter";
import { cn } from "@/lib/utils";
import { useVoiceAgent } from "@/hooks/useVoiceAgent";
import VoiceOrb from "@/components/VoiceOrb";
import { RelayToast } from "@/components/relay-toast";

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
  value, onChange, disabled,
}: { value: string; onChange: (v: string) => void; disabled: boolean }) {
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
    gemini: "Google Gemini", openai: "OpenAI", anthropic: "Anthropic", openrouter: "OpenRouter",
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
                {!group.available && <span className="ml-auto text-[10px] text-muted-foreground bg-muted/20 px-1.5 py-0.5 rounded-full">Key required</span>}
              </div>
              {group.models.map(model => (
                <button
                  key={model.id}
                  onClick={() => { if (!group.available) return; onChange(model.id); setOpen(false); }}
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
                  {model.contextWindow && <p className="text-[10px] text-muted-foreground/60 mt-0.5">{(model.contextWindow / 1000).toFixed(0)}K context</p>}
                </button>
              ))}
              {!group.available && (
                <div className="px-3 pb-2">
                  <WouterLink href="/settings">
                    <span className="text-xs text-primary hover:underline cursor-pointer">Add {providerLabel[group.provider]} key in Settings →</span>
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

// ─── Mermaid diagram block ─────────────────────────────────────────────────────

function MermaidBlock({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // @ts-ignore
        const mermaid = (await import("https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs" as any)).default;
        mermaid.initialize({ startOnLoad: false, theme: "dark" });
        const { svg } = await mermaid.render(`mermaid-${Date.now()}`, code.trim());
        if (!cancelled && ref.current) ref.current.innerHTML = svg;
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => { cancelled = true; };
  }, [code]);

  if (error) return <pre className="text-xs text-muted-foreground bg-black/30 rounded-lg p-3 overflow-x-auto">{code}</pre>;
  return <div ref={ref} className="my-3 bg-black/20 rounded-xl p-3 overflow-x-auto flex justify-center" />;
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

function parseBlocks(content: string): Array<{ type: "text" | "mermaid" | "code"; value: string; lang?: string }> {
  const blocks: Array<{ type: "text" | "mermaid" | "code"; value: string; lang?: string }> = [];
  const regex = /```(\w*)\n?([\s\S]*?)```/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    if (match.index > last) blocks.push({ type: "text", value: content.slice(last, match.index) });
    const lang = match[1].toLowerCase();
    if (lang === "mermaid") {
      blocks.push({ type: "mermaid", value: match[2] });
    } else {
      blocks.push({ type: "code", value: match[2], lang: match[1] });
    }
    last = match.index + match[0].length;
  }
  if (last < content.length) blocks.push({ type: "text", value: content.slice(last) });
  return blocks;
}

function MessageContent({ content }: { content: string }) {
  const blocks = parseBlocks(content);
  return (
    <>
      {blocks.map((b, i) => {
        if (b.type === "mermaid") return <MermaidBlock key={i} code={b.value} />;
        if (b.type === "code") return (
          <pre key={i} className="bg-black/50 border border-white/10 rounded-lg p-3 overflow-x-auto text-xs my-2 text-foreground/90">
            {b.lang && <span className="text-muted-foreground text-[10px] block mb-1">{b.lang}</span>}
            {b.value}
          </pre>
        );
        return <span key={i} className="whitespace-pre-wrap">{b.value}</span>;
      })}
    </>
  );
}

const MessageBubble = ({
  role, content, imageData, isStreaming, wasReasoning,
}: {
  role: string; content: string; imageData?: string | null; isStreaming?: boolean; wasReasoning?: boolean;
}) => {
  const isUser = role === "user";
  return (
    <div className={cn("flex w-full mb-6", isUser ? "justify-end" : "justify-start")}>
      <div className={cn(
        "max-w-[85%] rounded-2xl px-5 py-4 break-words leading-relaxed",
        isUser ? "bg-primary/20 text-foreground border border-primary/20" : "bg-card text-card-foreground border border-border shadow-sm",
      )}>
        {imageData && (
          <img
            src={imageData}
            alt="Attached"
            className="max-w-full max-h-48 rounded-lg mb-3 object-contain border border-border/50"
          />
        )}
        {isUser ? (
          <span className="whitespace-pre-wrap">{content}</span>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none text-foreground prose-p:leading-relaxed">
            {!content && isStreaming ? (
              <span className="animate-pulse text-muted-foreground">...</span>
            ) : (
              <MessageContent content={content} />
            )}
            {wasReasoning && (
              <div className="flex items-center gap-1.5 mt-2 text-xs text-violet-400/70">
                <Brain className="w-3 h-3" /> Reasoning mode
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Suggestions ──────────────────────────────────────────────────────────────

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
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [reasoningMode, setReasoningMode] = useState(false);
  const [attachedImage, setAttachedImage] = useState<{ base64: string; mimeType: string; preview: string } | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [relayToast, setRelayToast] = useState<string | null>(null);
  const voiceSessionRef = useRef(false);

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

  // ── Voice agent ────────────────────────────────────────────────────────
  const handleVoiceTranscript = useCallback((text: string) => {
    voiceSessionRef.current = true;
    handleSendVoice(text);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const voice = useVoiceAgent({ onTranscript: handleVoiceTranscript, wakeWords: ["hey lumina", "lumina"] });

  const handleOpenVoice = () => { setVoiceOpen(true); voice.toggleWake(); };
  const handleCloseVoice = () => {
    voice.stopListening(); voice.stopSpeaking();
    setVoiceOpen(false); voiceSessionRef.current = false;
  };

  // ── Image attachment ──────────────────────────────────────────────────

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const preview = URL.createObjectURL(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      const [header, base64] = dataUrl.split(",");
      const mimeType = header.match(/:(.*?);/)?.[1] ?? "image/jpeg";
      setAttachedImage({ base64, mimeType, preview });
    };
    reader.readAsDataURL(file);
    // reset so same file can be re-selected
    e.target.value = "";
  };

  const removeAttachment = () => {
    if (attachedImage) URL.revokeObjectURL(attachedImage.preview);
    setAttachedImage(null);
  };

  // ── Export ────────────────────────────────────────────────────────────

  const handleExport = async () => {
    if (!conversationId) return;
    setExportLoading(true);
    setShowOptions(false);
    try {
      const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
      const resp = await fetch(`${basePath}/api/gemini/conversations/${conversationId}/export`, {
        credentials: "include",
      });
      if (!resp.ok) return;
      const data = await resp.json();
      const blob = new Blob([data.markdown], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${data.title.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportLoading(false);
    }
  };

  // ─── Shared send logic ──────────────────────────────────────────────────

  const handleSendCore = async (msg: string, fromVoice = false) => {
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
        if (fromVoice) voice.setThinking(false);
        return;
      }
    }

    const imageToSend = attachedImage;
    setInput("");
    setAttachedImage(null);
    setIsStreaming(true);
    setStreamingContent("");

    const capturedConvId = conversationId;
    if (capturedConvId && messages) {
      queryClient.setQueryData(getListGeminiMessagesQueryKey(capturedConvId), [
        ...messages,
        {
          id: Date.now(), conversationId: capturedConvId, role: "user", content: msg,
          imageData: imageToSend ? `data:${imageToSend.mimeType};base64,${imageToSend.base64}` : null,
          createdAt: new Date().toISOString(),
        },
      ]);
    }

    let fullResponse = "";

    try {
      const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
      const body: Record<string, unknown> = {
        content: msg, model,
        systemPrompt: profile?.systemPrompt || undefined,
        reasoningMode,
      };
      if (imageToSend) {
        body.imageBase64 = imageToSend.base64;
        body.imageMimeType = imageToSend.mimeType;
      }

      const response = await fetch(`${basePath}/api/gemini/conversations/${targetConvId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });

      if (response.status === 402) {
        const b = await response.json();
        setStreamError({ message: b.error, provider: b.provider });
        setIsStreaming(false);
        if (fromVoice) voice.setThinking(false);
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
              if (data.relayConfirm) setRelayToast(data.relayConfirm);
              if (data.content) { fullResponse += data.content; setStreamingContent(prev => prev + data.content); }
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
        if (!capturedConvId) setLocation(`/chat/${targetConvId}`);
      }
      if (fromVoice && fullResponse && voiceSessionRef.current) {
        voice.speak(fullResponse);
      } else if (fromVoice) {
        voice.setThinking(false);
      }
    }
  };

  const handleSend = (text?: string) => handleSendCore((text ?? input).trim(), false);
  const handleSendVoice = (text: string) => handleSendCore(text.trim(), true);

  useEffect(() => { if (profile?.preferredModel && isNew) setModel(profile.preferredModel); }, [profile, isNew]);
  useEffect(() => { if (conversation) setEditTitle(conversation.title); }, [conversation]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, streamingContent]);

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
      {voiceOpen && (
        <VoiceOrb state={voice.state} interimText={voice.interimText} onClose={handleCloseVoice} onStopSpeaking={voice.stopSpeaking} />
      )}
      <RelayToast message={relayToast} onDismiss={() => setRelayToast(null)} />

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
              <div className="absolute right-0 mt-1 w-52 bg-popover border border-popover-border rounded-xl shadow-xl py-1 z-50 animate-in fade-in zoom-in duration-200">
                <button onClick={togglePin} className="w-full text-left px-4 py-2 text-sm text-foreground hover:bg-accent flex items-center gap-2">
                  <Pin className="w-4 h-4" /> {conversation.pinned ? "Unpin" : "Pin to sidebar"}
                </button>
                <button onClick={() => { setIsEditingTitle(true); setShowOptions(false); }} className="w-full text-left px-4 py-2 text-sm text-foreground hover:bg-accent flex items-center gap-2">
                  <Edit2 className="w-4 h-4" /> Rename
                </button>
                <button onClick={handleExport} disabled={exportLoading} className="w-full text-left px-4 py-2 text-sm text-foreground hover:bg-accent flex items-center gap-2">
                  <Download className="w-4 h-4" /> {exportLoading ? "Exporting..." : "Export as Markdown"}
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
            <MessageBubble
              key={msg.id}
              role={msg.role}
              content={msg.content}
              imageData={msg.imageData}
            />
          ))}
          {isStreaming && (
            <MessageBubble
              role="assistant"
              content={streamingContent}
              isStreaming={!streamingContent}
              wasReasoning={reasoningMode}
            />
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
          {/* Image attachment preview */}
          {attachedImage && (
            <div className="flex items-center gap-2 mb-2 px-1">
              <div className="relative">
                <img src={attachedImage.preview} alt="Attachment" className="h-14 w-14 rounded-lg object-cover border border-border/50" />
                <button
                  onClick={removeAttachment}
                  className="absolute -top-1.5 -right-1.5 bg-background border border-border rounded-full p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              <span className="text-xs text-muted-foreground">Image attached</span>
            </div>
          )}

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
              {/* Left: model selector + reasoning toggle */}
              <div className="flex items-center gap-2">
                <ModelSelector value={model} onChange={setModel} disabled={isStreaming} />
                <button
                  type="button"
                  onClick={() => setReasoningMode(r => !r)}
                  title={reasoningMode ? "Reasoning mode on" : "Enable reasoning mode"}
                  className={cn(
                    "flex items-center gap-1 text-xs rounded-lg px-2 py-1.5 transition-colors border",
                    reasoningMode
                      ? "bg-violet-500/20 border-violet-500/40 text-violet-400"
                      : "bg-muted/20 border-border/30 text-muted-foreground hover:text-foreground hover:border-violet-500/30"
                  )}
                >
                  <Brain className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{reasoningMode ? "Reasoning" : "Reason"}</span>
                </button>
              </div>

              {/* Right: attach + mic + send */}
              <div className="flex items-center gap-2">
                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach image"
                  className={cn(
                    "flex items-center justify-center w-9 h-9 rounded-xl border transition-all",
                    attachedImage
                      ? "bg-primary/20 border-primary/50 text-primary"
                      : "bg-muted/30 border-border/40 text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-primary/10"
                  )}
                >
                  <Paperclip className="w-4 h-4" />
                </button>

                {voice.isSupported && (
                  <button
                    type="button"
                    onClick={handleOpenVoice}
                    title="Open voice mode"
                    data-testid="button-voice"
                    className={cn(
                      "flex items-center justify-center w-9 h-9 rounded-xl border transition-all",
                      voiceOpen
                        ? "bg-primary/20 border-primary/50 text-primary"
                        : "bg-muted/30 border-border/40 text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-primary/10"
                    )}
                  >
                    <Mic className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="submit"
                  disabled={(!input.trim() && !attachedImage) || isStreaming}
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
