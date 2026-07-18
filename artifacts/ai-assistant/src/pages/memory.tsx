import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Brain, Plus, Trash2, X, Save, Loader2, Lightbulb } from "lucide-react";
import {
  useListAiMemories,
  getListAiMemoriesQueryKey,
  useCreateAiMemory,
  useDeleteAiMemory,
  useGetUserStats,
  getGetUserStatsQueryKey,
} from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

export default function MemoryPage() {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [newContent, setNewContent] = useState("");

  const { data: memories, isLoading } = useListAiMemories({
    query: { queryKey: getListAiMemoriesQueryKey() },
  });

  const createMemory = useCreateAiMemory();
  const deleteMemory = useDeleteAiMemory();

  const handleAdd = () => {
    if (!newContent.trim()) return;
    createMemory.mutate(
      { data: { content: newContent.trim() } },
      {
        onSuccess: () => {
          setNewContent("");
          setAdding(false);
          queryClient.invalidateQueries({ queryKey: getListAiMemoriesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetUserStatsQueryKey() });
        },
      }
    );
  };

  const handleDelete = (id: number) => {
    deleteMemory.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAiMemoriesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetUserStatsQueryKey() });
        },
      }
    );
  };

  const EXAMPLES = [
    "I prefer concise, bullet-point answers",
    "I'm a software engineer who works with TypeScript",
    "I'm based in New York, EST timezone",
    "I have a 10-year-old daughter named Emma",
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 md:px-10 border-b border-border/50 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
              <Brain className="w-6 h-6 text-violet-400" />
              AI Memory
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Things Lumina always remembers across every conversation.
            </p>
          </div>
          <button
            onClick={() => { setAdding(true); setNewContent(""); }}
            className="flex items-center gap-2 bg-primary text-primary-foreground rounded-xl px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Memory
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 md:p-10">
        <div className="max-w-2xl mx-auto space-y-4">

          {/* Add form */}
          {adding && (
            <div className="bg-card border border-primary/30 rounded-xl p-4 animate-in fade-in slide-in-from-top-2 duration-200">
              <p className="text-sm font-medium text-foreground mb-2">New Memory</p>
              <textarea
                value={newContent}
                onChange={e => setNewContent(e.target.value)}
                placeholder="e.g. I prefer concise answers with code examples..."
                maxLength={500}
                rows={3}
                autoFocus
                className="w-full bg-input/50 border border-border/50 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:border-primary/50"
              />
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-muted-foreground">{newContent.length}/500</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setAdding(false); setNewContent(""); }}
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg hover:bg-accent transition-colors"
                  >
                    <X className="w-3.5 h-3.5" /> Cancel
                  </button>
                  <button
                    onClick={handleAdd}
                    disabled={!newContent.trim() || createMemory.isPending}
                    className="flex items-center gap-1.5 text-sm bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {createMemory.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Save
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Memories list */}
          {isLoading ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : memories && memories.length > 0 ? (
            <>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                {memories.length} {memories.length === 1 ? "memory" : "memories"} — injected into every chat
              </p>
              {memories.map((mem) => (
                <div
                  key={mem.id}
                  className="flex items-start gap-3 bg-card border border-border/50 rounded-xl p-4 group hover:border-primary/20 transition-colors"
                >
                  <Brain className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
                  <p className="flex-1 text-sm text-foreground leading-relaxed">{mem.content}</p>
                  <button
                    onClick={() => handleDelete(mem.id)}
                    disabled={deleteMemory.isPending}
                    className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all"
                    aria-label="Delete memory"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </>
          ) : (
            <div className="text-center py-16 space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto">
                <Brain className="w-8 h-8 text-violet-400" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">No memories yet</h3>
                <p className="text-muted-foreground text-sm mt-1 max-w-sm mx-auto">
                  Add things you want Lumina to always know — your preferences, context, and anything that makes responses more personal.
                </p>
              </div>

              {/* Example suggestions */}
              <div className="mt-6 space-y-2 max-w-md mx-auto">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium flex items-center gap-1.5 justify-center">
                  <Lightbulb className="w-3.5 h-3.5" /> Ideas to get started
                </p>
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => { setNewContent(ex); setAdding(true); }}
                    className="w-full text-left text-sm bg-card/50 border border-border/50 hover:border-primary/40 hover:bg-primary/5 rounded-lg px-4 py-2.5 text-muted-foreground hover:text-foreground transition-all"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
