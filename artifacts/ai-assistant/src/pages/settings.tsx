import { useState, useEffect } from "react";
import { 
  useGetUserProfile, getGetUserProfileQueryKey, useUpdateUserProfile,
  useListUserApiKeys, getListUserApiKeysQueryKey,
  useSetUserApiKey, useDeleteUserApiKey,
  useListModels, getListModelsQueryKey,
  useGetUserStats, getGetUserStatsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Settings2, Save, Moon, Sun, Monitor, Key, Eye, EyeOff, Trash2,
  CheckCircle2, AlertCircle, ChevronDown, ChevronRight, Brain, Sparkles, ArrowRight
} from "lucide-react";
import { SiGoogle } from "react-icons/si";
import { Bot } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

type Provider = "gemini" | "openai" | "anthropic" | "openrouter";

const PROVIDER_META: Record<Provider, { label: string; icon: React.ReactNode; color: string; description: string; placeholder: string; docsUrl: string }> = {
  gemini: {
    label: "Google AI Studio (Gemini)", icon: <SiGoogle className="w-5 h-5" />, color: "text-primary",
    description: "Access Gemini 2.5 Flash, 2.5 Pro, and Flash-Lite models with your Google AI Studio key", placeholder: "AIzaSy...",
    docsUrl: "https://aistudio.google.com/app/apikey",
  },
  openai: {
    label: "OpenAI", icon: <Bot className="w-5 h-5" />, color: "text-green-400",
    description: "Access GPT-4o, o3-mini, o1, and more", placeholder: "sk-proj-...",
    docsUrl: "https://platform.openai.com/api-keys",
  },
  anthropic: {
    label: "Anthropic", icon: <span className="text-[#c07945] font-bold text-sm">A</span>, color: "text-orange-400",
    description: "Access Claude 3.5 Sonnet, Haiku, Opus", placeholder: "sk-ant-...",
    docsUrl: "https://console.anthropic.com/settings/keys",
  },
  openrouter: {
    label: "OpenRouter", icon: <span className="text-purple-400 font-bold text-sm">OR</span>, color: "text-purple-400",
    description: "Access Llama 3.3, DeepSeek R1, Phi-4, Qwen and many more", placeholder: "sk-or-...",
    docsUrl: "https://openrouter.ai/keys",
  },
};

function ProviderKeyRow({ provider, maskedKey, onSave, onDelete }: {
  provider: Provider; maskedKey: string | null;
  onSave: (p: Provider, key: string) => Promise<void>;
  onDelete: (p: Provider) => Promise<void>;
}) {
  const meta = PROVIDER_META[provider];
  const hasKey = !!maskedKey;
  const [expanded, setExpanded] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    if (!keyInput.trim()) return;
    setSaving(true);
    try {
      await onSave(provider, keyInput.trim());
      setKeyInput(""); setExpanded(false); setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirm(`Remove your ${meta.label} API key?`)) return;
    setDeleting(true);
    try { await onDelete(provider); } finally { setDeleting(false); }
  };

  return (
    <div className={cn("border rounded-xl transition-all overflow-hidden", hasKey ? "border-primary/30 bg-primary/5" : "border-border/50 bg-card/30")}>
      <div className="flex items-center gap-3 p-4 cursor-pointer hover:bg-white/5 transition-colors" onClick={() => setExpanded(!expanded)}>
        <div className={cn("flex items-center justify-center w-8 h-8 rounded-lg bg-background/50", meta.color)}>
          {meta.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">{meta.label}</span>
            {hasKey ? (
              <span className="flex items-center gap-1 text-xs text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">
                <CheckCircle2 className="w-3 h-3" /> Configured
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-muted-foreground bg-muted/20 px-2 py-0.5 rounded-full">
                <AlertCircle className="w-3 h-3" /> Not set
              </span>
            )}
            {saved && <span className="text-xs text-green-400">Saved!</span>}
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5">{meta.description}</p>
        </div>
        {hasKey && <span className="text-xs font-mono text-muted-foreground hidden sm:block">{maskedKey}</span>}
        {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-border/30 pt-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Get your API key from{" "}
            <a href={meta.docsUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{meta.docsUrl.split("/")[2]}</a>.
            {" "}Keys are encrypted with AES-256-GCM before storage.
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showKey ? "text" : "password"}
                value={keyInput} onChange={e => setKeyInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSave()}
                placeholder={meta.placeholder}
                className="w-full bg-input/50 border border-border rounded-lg px-3 py-2 pr-10 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-foreground"
                data-testid={`input-api-key-${provider}`}
              />
              <button onClick={() => setShowKey(!showKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" type="button">
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <button onClick={handleSave} disabled={!keyInput.trim() || saving} data-testid={`button-save-key-${provider}`} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {saving ? "Saving..." : "Save"}
            </button>
            {hasKey && (
              <button onClick={handleDelete} disabled={deleting} data-testid={`button-delete-key-${provider}`} className="p-2 text-destructive hover:bg-destructive/10 rounded-lg transition-colors" title="Remove key">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: profile, isLoading } = useGetUserProfile({ query: { queryKey: getGetUserProfileQueryKey() } });
  const { data: apiKeys } = useListUserApiKeys({ query: { queryKey: getListUserApiKeysQueryKey() } });
  const { data: models } = useListModels({ query: { queryKey: getListModelsQueryKey() } });
  const { data: stats } = useGetUserStats({ query: { queryKey: getGetUserStatsQueryKey() } });
  const updateProfile = useUpdateUserProfile();
  const upsertKey = useSetUserApiKey();
  const deleteKey = useDeleteUserApiKey();

  const [displayName, setDisplayName] = useState("");
  const [preferredModel, setPreferredModel] = useState("gemini-2.5-flash");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [theme, setTheme] = useState("system");
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName || "");
      setPreferredModel(profile.preferredModel || "gemini-2.5-flash");
      setSystemPrompt(profile.systemPrompt || "");
      setTheme(profile.theme || "system");
    }
  }, [profile]);

  const handleSave = () => {
    updateProfile.mutate({ data: { displayName, preferredModel, systemPrompt, theme } }, {
      onSuccess: (updatedData) => {
        queryClient.setQueryData(getGetUserProfileQueryKey(), updatedData);
        setIsSaved(true); setTimeout(() => setIsSaved(false), 2000);
        if (theme === "dark") document.documentElement.classList.add("dark");
        else if (theme === "light") document.documentElement.classList.remove("dark");
        else {
          if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) document.documentElement.classList.add("dark");
          else document.documentElement.classList.remove("dark");
        }
      }
    });
  };

  const handleSaveKey = async (provider: Provider, key: string) => {
    await upsertKey.mutateAsync({ data: { provider, key } });
    queryClient.invalidateQueries({ queryKey: getListUserApiKeysQueryKey() });
  };

  const handleDeleteKey = async (provider: Provider) => {
    await deleteKey.mutateAsync({ provider });
    queryClient.invalidateQueries({ queryKey: getListUserApiKeysQueryKey() });
  };

  const getKeyForProvider = (provider: Provider) => apiKeys?.find(k => k.provider === provider)?.maskedKey ?? null;

  const geminiModels = models?.filter(m => m.provider === "gemini") ?? [];
  const openaiModels = models?.filter(m => m.provider === "openai") ?? [];
  const anthropicModels = models?.filter(m => m.provider === "anthropic") ?? [];
  const openrouterModels = models?.filter(m => m.provider === "openrouter") ?? [];

  if (isLoading) {
    return (
      <div className="flex-1 p-8 flex items-center justify-center">
        <div className="flex gap-2">
          <div className="w-3 h-3 rounded-full bg-primary/40 typing-dot" />
          <div className="w-3 h-3 rounded-full bg-primary/40 typing-dot" />
          <div className="w-3 h-3 rounded-full bg-primary/40 typing-dot" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 h-full overflow-y-auto scrollbar-thin p-6 md:p-10 pb-20">
      <div className="max-w-2xl mx-auto space-y-8">

        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2 flex items-center gap-3">
            <Settings2 className="w-8 h-8 text-primary" />
            Settings
          </h1>
          <p className="text-muted-foreground">Customize your Lina experience.</p>
        </div>

        {/* Profile */}
        <div className="bg-glass rounded-2xl p-6 space-y-5">
          <h3 className="text-lg font-semibold border-b border-border/50 pb-2">Profile</h3>
          <div>
            <label className="block text-sm font-medium mb-1.5 text-foreground">Display Name</label>
            <input
              type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
              placeholder="How should I address you?"
              data-testid="input-display-name"
              className="w-full bg-input/50 border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-foreground"
            />
          </div>
        </div>

        {/* Memory quick link */}
        <div className="bg-glass rounded-2xl p-6 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-violet-400" />
              <h3 className="text-lg font-semibold">AI Memory</h3>
            </div>
            <Link href="/memory">
              <button className="flex items-center gap-1.5 text-sm text-primary hover:underline">
                Manage memories <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </Link>
          </div>
          <p className="text-sm text-muted-foreground">
            {stats?.memoriesCount
              ? `You have ${stats.memoriesCount} memor${stats.memoriesCount === 1 ? "y" : "ies"} — these are injected into every conversation.`
              : "No memories yet. Add things you want Lina to always remember across every chat."}
          </p>
        </div>

        {/* Personas quick link */}
        <div className="bg-glass rounded-2xl p-6 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold">AI Personas</h3>
            </div>
            <Link href="/personas">
              <button className="flex items-center gap-1.5 text-sm text-primary hover:underline">
                Manage personas <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </Link>
          </div>
          <p className="text-sm text-muted-foreground">
            {stats?.personasCount
              ? `You have ${stats.personasCount} persona${stats.personasCount === 1 ? "" : "s"}. Set one as default to customize Lina's personality.`
              : "No personas yet. Create custom AI personalities with unique names, emojis, and instructions."}
          </p>
        </div>

        {/* AI Providers */}
        <div className="bg-glass rounded-2xl p-6 space-y-5">
          <div>
            <h3 className="text-lg font-semibold border-b border-border/50 pb-2 flex items-center gap-2">
              <Key className="w-5 h-5 text-primary" />
              AI Providers
            </h3>
            <p className="text-sm text-muted-foreground mt-2">
              Gemini models work out-of-the-box. Add your custom Google AI Studio key or unlock OpenAI, Anthropic, and OpenRouter models below.
            </p>
          </div>

          {(["gemini", "openai", "anthropic", "openrouter"] as Provider[]).map(provider => (
            <ProviderKeyRow
              key={provider} provider={provider}
              maskedKey={getKeyForProvider(provider)}
              onSave={handleSaveKey} onDelete={handleDeleteKey}
            />
          ))}
        </div>

        {/* AI Preferences */}
        <div className="bg-glass rounded-2xl p-6 space-y-5">
          <h3 className="text-lg font-semibold border-b border-border/50 pb-2">AI Preferences</h3>
          <div>
            <label className="block text-sm font-medium mb-1.5 text-foreground">Default Model</label>
            <select
              value={preferredModel} onChange={e => setPreferredModel(e.target.value)}
              data-testid="select-preferred-model"
              className="w-full bg-input/50 border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-foreground appearance-none"
            >
              {geminiModels.length > 0 && (
                <optgroup label="Google Gemini (built-in)">
                  {geminiModels.map(m => <option key={m.id} value={m.id}>{m.name} — {m.description}</option>)}
                </optgroup>
              )}
              {openaiModels.length > 0 && getKeyForProvider("openai") && (
                <optgroup label="OpenAI">
                  {openaiModels.map(m => <option key={m.id} value={m.id}>{m.name} — {m.description}</option>)}
                </optgroup>
              )}
              {anthropicModels.length > 0 && getKeyForProvider("anthropic") && (
                <optgroup label="Anthropic">
                  {anthropicModels.map(m => <option key={m.id} value={m.id}>{m.name} — {m.description}</option>)}
                </optgroup>
              )}
              {openrouterModels.length > 0 && getKeyForProvider("openrouter") && (
                <optgroup label="OpenRouter">
                  {openrouterModels.map(m => <option key={m.id} value={m.id}>{m.name} — {m.description}</option>)}
                </optgroup>
              )}
            </select>
            <p className="text-xs text-muted-foreground mt-1.5">Add provider keys above to unlock more models.</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5 text-foreground">Custom Instructions (System Prompt)</label>
            <textarea
              value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)}
              placeholder="E.g., Always respond in French, keep answers concise..."
              rows={4} data-testid="textarea-system-prompt"
              className="w-full bg-input/50 border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-foreground resize-none"
            />
            <p className="text-xs text-muted-foreground mt-1.5">Provided to the AI before every conversation. Memory entries are appended automatically.</p>
          </div>
        </div>

        {/* Appearance */}
        <div className="bg-glass rounded-2xl p-6 space-y-5">
          <h3 className="text-lg font-semibold border-b border-border/50 pb-2">Appearance</h3>
          <div>
            <label className="block text-sm font-medium mb-3 text-foreground">Theme</label>
            <div className="grid grid-cols-3 gap-3">
              {([["light", <Sun className="w-5 h-5 mb-2" />, "Light"], ["dark", <Moon className="w-5 h-5 mb-2" />, "Dark"], ["system", <Monitor className="w-5 h-5 mb-2" />, "System"]] as const).map(([val, icon, label]) => (
                <button
                  key={val} onClick={() => setTheme(val)} data-testid={`button-theme-${val}`}
                  className={cn(
                    "flex flex-col items-center justify-center py-4 rounded-xl border transition-all",
                    theme === val ? "border-primary bg-primary/10 text-primary" : "border-border bg-input/20 hover:bg-input/50 text-muted-foreground"
                  )}
                >
                  {icon}
                  <span className="text-sm font-medium">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Save */}
        <div className="flex justify-end">
          <button
            onClick={handleSave} disabled={updateProfile.isPending} data-testid="button-save-preferences"
            className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {updateProfile.isPending ? "Saving..." : isSaved ? "Saved!" : "Save Preferences"}
          </button>
        </div>

      </div>
    </div>
  );
}
