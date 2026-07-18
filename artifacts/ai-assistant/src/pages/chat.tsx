import { useState, useRef, useEffect } from "react";
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
  useCreateGeminiConversation
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Send, Sparkles, MoreVertical, Trash2, Edit2, Pin, MessageSquare, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const ModelSelector = ({ value, onChange, disabled }: { value: string, onChange: (v: string) => void, disabled: boolean }) => (
  <select 
    value={value} 
    onChange={e => onChange(e.target.value)}
    disabled={disabled}
    className="bg-transparent text-xs text-muted-foreground font-medium outline-none cursor-pointer hover:text-foreground transition-colors appearance-none"
  >
    <option value="gemini-2.5-flash">Flash (Fast)</option>
    <option value="gemini-2.5-pro">Pro (Capable)</option>
    <option value="gemini-3.1-pro-preview">3.1 Pro (Preview)</option>
  </select>
);

const MessageBubble = ({ role, content, isStreaming }: { role: string, content: string, isStreaming?: boolean }) => {
  const isUser = role === "user";
  
  return (
    <div className={cn("flex w-full mb-6", isUser ? "justify-end" : "justify-start")}>
      <div 
        className={cn(
          "max-w-[85%] rounded-2xl px-5 py-4",
          isUser 
            ? "bg-primary/20 text-foreground border border-primary/20" 
            : "bg-card text-card-foreground border border-border shadow-sm",
          "whitespace-pre-wrap break-words leading-relaxed"
        )}
      >
        {isUser ? (
          content
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none text-foreground prose-p:leading-relaxed prose-pre:bg-black/50 prose-pre:border prose-pre:border-white/10">
            {content || (isStreaming ? <span className="animate-pulse">...</span> : "")}
          </div>
        )}
      </div>
    </div>
  );
};

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

  const { data: profile } = useGetUserProfile({
    query: { queryKey: getGetUserProfileQueryKey() }
  });

  const { data: conversation } = useGetGeminiConversation(conversationId!, {
    query: { enabled: !!conversationId, queryKey: getGetGeminiConversationQueryKey(conversationId!) }
  });

  const { data: messages } = useListGeminiMessages(conversationId!, {
    query: { enabled: !!conversationId, queryKey: getListGeminiMessagesQueryKey(conversationId!) }
  });

  const updateConversation = useUpdateGeminiConversation();
  const deleteConversation = useDeleteGeminiConversation();
  const createConversation = useCreateGeminiConversation();

  useEffect(() => {
    if (profile?.preferredModel && !input && isNew) {
      setModel(profile.preferredModel);
    }
  }, [profile, isNew, input]);

  useEffect(() => {
    if (conversation) {
      setEditTitle(conversation.title);
    }
  }, [conversation]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isStreaming) return;

    let targetConvId = conversationId;

    if (!targetConvId) {
      // Create new conversation first
      try {
        const newConv = await createConversation.mutateAsync({ 
          data: { title: input.slice(0, 30) + (input.length > 30 ? "..." : "") } 
        });
        targetConvId = newConv.id;
        // Don't navigate yet, stream first, then navigate
        window.history.pushState(null, '', `${import.meta.env.BASE_URL}chat/${newConv.id}`.replace('//', '/'));
      } catch (err) {
        console.error("Failed to create conversation", err);
        return;
      }
    }

    const userMessage = input;
    setInput("");
    setIsStreaming(true);
    setStreamingContent("");

    // Optimistically add user message to cache if already in a conversation
    if (conversationId && messages) {
      const tempId = Date.now();
      queryClient.setQueryData(getListGeminiMessagesQueryKey(conversationId), [...messages, {
        id: tempId,
        conversationId,
        role: "user",
        content: userMessage,
        createdAt: new Date().toISOString()
      }]);
    }

    try {
      const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
      const response = await fetch(`${basePath}/api/gemini/conversations/${targetConvId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          content: userMessage, 
          model: model,
          systemPrompt: profile?.systemPrompt || undefined
        }),
        credentials: "include",
      });

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
              if (data.content) {
                setStreamingContent(prev => prev + data.content);
              }
            } catch (e) {}
          }
        }
      }
    } catch (error) {
      console.error("Streaming error:", error);
    } finally {
      setIsStreaming(false);
      if (targetConvId) {
        queryClient.invalidateQueries({ queryKey: getListGeminiMessagesQueryKey(targetConvId) });
        queryClient.invalidateQueries({ queryKey: ["/api/gemini/conversations"] }); // invalidate list
        queryClient.invalidateQueries({ queryKey: ["/api/user/stats"] });
        
        if (!conversationId) {
          // If we created a new one, formally set location
          setLocation(`/chat/${targetConvId}`);
        }
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const togglePin = () => {
    if (!conversationId || !conversation) return;
    updateConversation.mutate(
      { id: conversationId, data: { pinned: !conversation.pinned } },
      { onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetGeminiConversationQueryKey(conversationId) });
        queryClient.invalidateQueries({ queryKey: ["/api/user/pinned"] });
      }}
    );
    setShowOptions(false);
  };

  const saveTitle = () => {
    if (!conversationId || !editTitle.trim()) {
      setIsEditingTitle(false);
      return;
    }
    updateConversation.mutate(
      { id: conversationId, data: { title: editTitle } },
      { onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetGeminiConversationQueryKey(conversationId) });
        queryClient.invalidateQueries({ queryKey: ["/api/gemini/conversations"] });
      }}
    );
    setIsEditingTitle(false);
  };

  const handleDelete = () => {
    if (!conversationId) return;
    if (confirm("Delete this conversation?")) {
      deleteConversation.mutate(
        { id: conversationId },
        { onSuccess: () => setLocation("/chat") }
      );
    }
  };

  return (
    <div className="flex flex-col h-full w-full">
      {/* Chat Header */}
      {!isNew && conversation && (
        <header className="shrink-0 h-14 border-b border-border/50 px-6 flex items-center justify-between bg-background/50 backdrop-blur-sm z-10">
          <div className="flex-1 min-w-0 mr-4">
            {isEditingTitle ? (
              <input 
                type="text" 
                value={editTitle} 
                onChange={e => setEditTitle(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={e => e.key === 'Enter' && saveTitle()}
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
                <div className="h-px bg-border my-1"></div>
                <button onClick={handleDelete} className="w-full text-left px-4 py-2 text-sm text-destructive hover:bg-destructive/10 flex items-center gap-2">
                  <Trash2 className="w-4 h-4" /> Delete
                </button>
              </div>
            )}
          </div>
        </header>
      )}

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 md:px-10">
        <div className="max-w-3xl mx-auto py-8">
          
          {isNew ? (
            <div className="h-full flex flex-col items-center justify-center text-center mt-20 md:mt-32 mb-10">
              <div className="w-16 h-16 rounded-2xl bg-iridescent shadow-xl shadow-primary/20 flex items-center justify-center mb-6">
                <Sparkles className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl font-semibold mb-2">How can I help you today?</h2>
              <p className="text-muted-foreground mb-10 max-w-md">Lumina is ready to brainstorm, write code, analyze data, or just talk.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-2xl">
                {[
                  "Write a python script to parse CSV files",
                  "Explain quantum computing simply",
                  "Help me plan a 3-day trip to Tokyo",
                  "Draft a polite decline email"
                ].map((prompt, i) => (
                  <button 
                    key={i}
                    onClick={() => setInput(prompt)}
                    className="p-4 rounded-xl border border-border/50 bg-card/40 hover:bg-card hover:border-primary/30 text-left text-sm text-foreground transition-all flex items-start gap-3 group"
                  >
                    <MessageSquare className="w-4 h-4 text-muted-foreground mt-0.5 group-hover:text-primary transition-colors" />
                    <span>{prompt}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col min-h-full justify-end">
              {messages?.map((msg) => (
                <MessageBubble key={msg.id} role={msg.role} content={msg.content} />
              ))}
              
              {isStreaming && streamingContent && (
                <MessageBubble role="model" content={streamingContent} isStreaming={true} />
              )}
              
              {isStreaming && !streamingContent && (
                <div className="flex justify-start mb-6">
                  <div className="bg-card border border-border rounded-2xl px-5 py-4 flex gap-1 items-center">
                    <div className="w-2 h-2 rounded-full bg-primary/60 typing-dot"></div>
                    <div className="w-2 h-2 rounded-full bg-primary/60 typing-dot"></div>
                    <div className="w-2 h-2 rounded-full bg-primary/60 typing-dot"></div>
                  </div>
                </div>
              )}
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="shrink-0 px-4 md:px-10 pb-6 pt-2 bg-gradient-to-t from-background via-background to-transparent">
        <div className="max-w-3xl mx-auto">
          <form onSubmit={handleSend} className="relative group">
            <div className="glass-input-wrapper bg-card/60 backdrop-blur-2xl rounded-2xl p-2 transition-all">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message Lumina..."
                className="w-full bg-transparent border-none text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-0 px-4 py-3 min-h-[56px] max-h-48 overflow-y-auto scrollbar-thin"
                rows={1}
                disabled={isStreaming}
              />
              <div className="flex items-center justify-between px-3 pb-1 pt-2 border-t border-border/30">
                <div className="flex items-center gap-2">
                  <ModelSelector value={model} onChange={setModel} disabled={isStreaming} />
                </div>
                <button
                  type="submit"
                  disabled={!input.trim() || isStreaming}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground p-2 rounded-xl transition-all disabled:opacity-50 disabled:hover:bg-primary"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </form>
          <div className="text-center mt-2">
            <span className="text-[10px] text-muted-foreground/60">Lumina can make mistakes. Consider verifying important information.</span>
          </div>
        </div>
      </div>
    </div>
  );
}