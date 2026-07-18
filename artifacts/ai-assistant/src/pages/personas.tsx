import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Sparkles, Plus, Trash2, X, Save, Loader2, Star, Check } from "lucide-react";
import {
  useListAiPersonas,
  getListAiPersonasQueryKey,
  useCreateAiPersona,
  useUpdateAiPersona,
  useDeleteAiPersona,
  useGetUserStats,
  getGetUserStatsQueryKey,
} from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

const STARTERS = [
  { emoji: "🎓", name: "Tutor", systemPrompt: "You are a patient, encouraging tutor. Explain concepts clearly with relatable examples. Ask questions to check understanding and adapt to the learner's level." },
  { emoji: "💼", name: "Executive Assistant", systemPrompt: "You are a sharp, professional executive assistant. Be concise and action-oriented. Prioritize clarity, structure responses with bullets or numbered lists, and focus on outcomes." },
  { emoji: "🎨", name: "Creative Director", systemPrompt: "You are a creative director with deep expertise in design, storytelling, and brand. Be imaginative, use vivid language, and help the user think beyond the obvious." },
  { emoji: "🔬", name: "Research Analyst", systemPrompt: "You are a meticulous research analyst. Provide well-structured, evidence-based responses. Cite relevant considerations, acknowledge uncertainty, and present multiple perspectives." },
];

interface PersonaFormData {
  emoji: string;
  name: string;
  systemPrompt: string;
  isDefault: boolean;
}

const emptyForm = (): PersonaFormData => ({ emoji: "🤖", name: "", systemPrompt: "", isDefault: false });

export default function PersonasPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<PersonaFormData>(emptyForm());
  const [editingId, setEditingId] = useState<number | null>(null);

  const { data: personas, isLoading } = useListAiPersonas({
    query: { queryKey: getListAiPersonasQueryKey() },
  });

  const createPersona = useCreateAiPersona();
  const updatePersona = useUpdateAiPersona();
  const deletePersona = useDeleteAiPersona();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListAiPersonasQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetUserStatsQueryKey() });
  };

  const handleSave = () => {
    if (!form.name.trim() || !form.systemPrompt.trim()) return;
    if (editingId !== null) {
      updatePersona.mutate(
        { id: editingId, data: form },
        { onSuccess: () => { invalidate(); closeForm(); } }
      );
    } else {
      createPersona.mutate(
        { data: form },
        { onSuccess: () => { invalidate(); closeForm(); } }
      );
    }
  };

  const handleSetDefault = (id: number, current: boolean) => {
    updatePersona.mutate(
      { id, data: { isDefault: !current } },
      { onSuccess: invalidate }
    );
  };

  const handleDelete = (id: number) => {
    deletePersona.mutate({ id }, { onSuccess: invalidate });
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm());
  };

  const openEdit = (p: { id: number; name: string; emoji: string; systemPrompt: string; isDefault: boolean }) => {
    setForm({ emoji: p.emoji, name: p.name, systemPrompt: p.systemPrompt, isDefault: p.isDefault });
    setEditingId(p.id);
    setShowForm(true);
  };

  const useStarter = (s: typeof STARTERS[0]) => {
    setForm({ ...emptyForm(), emoji: s.emoji, name: s.name, systemPrompt: s.systemPrompt });
    setShowForm(true);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 md:px-10 border-b border-border/50 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
              <Sparkles className="w-6 h-6 text-primary" />
              AI Personas
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Give Lumina a personality. The default persona's prompt is used in every chat.
            </p>
          </div>
          <button
            onClick={() => { setShowForm(true); setEditingId(null); setForm(emptyForm()); }}
            className="flex items-center gap-2 bg-primary text-primary-foreground rounded-xl px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Persona
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 md:p-10">
        <div className="max-w-3xl mx-auto space-y-4">

          {/* Form */}
          {showForm && (
            <div className="bg-card border border-primary/30 rounded-2xl p-5 animate-in fade-in slide-in-from-top-2 duration-200 space-y-4">
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={form.emoji}
                  onChange={e => setForm(f => ({ ...f, emoji: e.target.value }))}
                  className="w-14 text-center text-2xl bg-input/50 border border-border/50 rounded-lg px-2 py-2 focus:outline-none focus:border-primary/50"
                  maxLength={4}
                />
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Persona name"
                  className="flex-1 bg-input/50 border border-border/50 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                />
              </div>
              <textarea
                value={form.systemPrompt}
                onChange={e => setForm(f => ({ ...f, systemPrompt: e.target.value }))}
                placeholder="Describe this persona's personality, tone, and expertise..."
                rows={4}
                className="w-full bg-input/50 border border-border/50 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:border-primary/50"
              />
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isDefault}
                    onChange={e => setForm(f => ({ ...f, isDefault: e.target.checked }))}
                    className="rounded border-border"
                  />
                  Set as default persona
                </label>
                <div className="flex gap-2">
                  <button onClick={closeForm} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg hover:bg-accent transition-colors">
                    <X className="w-3.5 h-3.5" /> Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={!form.name.trim() || !form.systemPrompt.trim() || createPersona.isPending || updatePersona.isPending}
                    className="flex items-center gap-1.5 text-sm bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {(createPersona.isPending || updatePersona.isPending) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    {editingId !== null ? "Update" : "Save"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : personas && personas.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {personas.map((p) => (
                <div
                  key={p.id}
                  className={cn(
                    "relative bg-card border rounded-2xl p-5 group hover:border-primary/30 transition-all cursor-pointer",
                    p.isDefault ? "border-primary/50 shadow-primary/5 shadow-lg" : "border-border/50"
                  )}
                  onClick={() => openEdit(p)}
                >
                  {p.isDefault && (
                    <span className="absolute top-3 right-3 flex items-center gap-1 text-xs bg-primary/15 text-primary rounded-full px-2 py-0.5">
                      <Star className="w-3 h-3" /> Default
                    </span>
                  )}
                  <div className="flex items-start gap-3 mb-3">
                    <span className="text-3xl">{p.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground">{p.name}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{p.systemPrompt}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-2 border-t border-border/30">
                    <button
                      onClick={e => { e.stopPropagation(); handleSetDefault(p.id, p.isDefault); }}
                      className={cn(
                        "flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg transition-colors",
                        p.isDefault ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-accent"
                      )}
                    >
                      <Check className="w-3 h-3" />
                      {p.isDefault ? "Default" : "Set default"}
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(p.id); }}
                      className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 px-2 py-1 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-center py-8 space-y-3">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
                  <Sparkles className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">No personas yet</h3>
                  <p className="text-muted-foreground text-sm mt-1">Start with one of our prebuilt personas or create your own.</p>
                </div>
              </div>

              {/* Starter templates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {STARTERS.map((s) => (
                  <button
                    key={s.name}
                    onClick={() => useStarter(s)}
                    className="text-left bg-card border border-border/50 hover:border-primary/30 rounded-2xl p-4 transition-all group"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-2xl">{s.emoji}</span>
                      <span className="font-medium text-foreground">{s.name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{s.systemPrompt}</p>
                    <p className="text-xs text-primary mt-2 opacity-0 group-hover:opacity-100 transition-opacity">Use this template →</p>
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
