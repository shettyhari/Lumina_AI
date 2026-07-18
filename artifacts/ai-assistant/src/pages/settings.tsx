import { useState, useEffect } from "react";
import { 
  useGetUserProfile, 
  getGetUserProfileQueryKey, 
  useUpdateUserProfile 
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Settings2, Save, Moon, Sun, Monitor } from "lucide-react";

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: profile, isLoading } = useGetUserProfile({
    query: { queryKey: getGetUserProfileQueryKey() }
  });

  const updateProfile = useUpdateUserProfile();

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
    updateProfile.mutate(
      {
        data: {
          displayName,
          preferredModel,
          systemPrompt,
          theme,
        }
      },
      {
        onSuccess: (updatedData) => {
          queryClient.setQueryData(getGetUserProfileQueryKey(), updatedData);
          setIsSaved(true);
          setTimeout(() => setIsSaved(false), 2000);
          
          // Apply theme
          if (theme === 'dark') document.documentElement.classList.add('dark');
          else if (theme === 'light') document.documentElement.classList.remove('dark');
          else {
            if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
              document.documentElement.classList.add('dark');
            } else {
              document.documentElement.classList.remove('dark');
            }
          }
        }
      }
    );
  };

  if (isLoading) {
    return (
      <div className="flex-1 p-8 flex items-center justify-center">
        <div className="flex gap-2">
          <div className="w-3 h-3 rounded-full bg-primary/40 typing-dot"></div>
          <div className="w-3 h-3 rounded-full bg-primary/40 typing-dot"></div>
          <div className="w-3 h-3 rounded-full bg-primary/40 typing-dot"></div>
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
          <p className="text-muted-foreground">Customize your Lumina experience.</p>
        </div>

        <div className="bg-glass rounded-2xl p-6 space-y-8">
          
          {/* Profile Settings */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b border-border/50 pb-2">Profile</h3>
            <div>
              <label className="block text-sm font-medium mb-1.5 text-foreground">Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="How should I address you?"
                className="w-full bg-input/50 border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-foreground"
              />
            </div>
          </div>

          {/* AI Preferences */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b border-border/50 pb-2">AI Preferences</h3>
            <div>
              <label className="block text-sm font-medium mb-1.5 text-foreground">Preferred Model</label>
              <select
                value={preferredModel}
                onChange={(e) => setPreferredModel(e.target.value)}
                className="w-full bg-input/50 border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-foreground appearance-none"
              >
                <option value="gemini-2.5-flash">Gemini 2.5 Flash (Fastest)</option>
                <option value="gemini-2.5-pro">Gemini 2.5 Pro (Most Capable)</option>
                <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro Preview (Experimental)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5 text-foreground">Custom Instructions (System Prompt)</label>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="E.g., Always respond in French, keep answers concise..."
                rows={4}
                className="w-full bg-input/50 border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-foreground resize-none"
              />
              <p className="text-xs text-muted-foreground mt-1.5">This context is provided to the AI before every conversation.</p>
            </div>
          </div>

          {/* Appearance */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b border-border/50 pb-2">Appearance</h3>
            <div>
              <label className="block text-sm font-medium mb-3 text-foreground">Theme</label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => setTheme("light")}
                  className={`flex flex-col items-center justify-center py-4 rounded-xl border ${theme === 'light' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-input/20 hover:bg-input/50 text-muted-foreground'} transition-all`}
                >
                  <Sun className="w-5 h-5 mb-2" />
                  <span className="text-sm font-medium">Light</span>
                </button>
                <button
                  onClick={() => setTheme("dark")}
                  className={`flex flex-col items-center justify-center py-4 rounded-xl border ${theme === 'dark' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-input/20 hover:bg-input/50 text-muted-foreground'} transition-all`}
                >
                  <Moon className="w-5 h-5 mb-2" />
                  <span className="text-sm font-medium">Dark</span>
                </button>
                <button
                  onClick={() => setTheme("system")}
                  className={`flex flex-col items-center justify-center py-4 rounded-xl border ${theme === 'system' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-input/20 hover:bg-input/50 text-muted-foreground'} transition-all`}
                >
                  <Monitor className="w-5 h-5 mb-2" />
                  <span className="text-sm font-medium">System</span>
                </button>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="pt-4 flex justify-end">
            <button
              onClick={handleSave}
              disabled={updateProfile.isPending}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {updateProfile.isPending ? "Saving..." : isSaved ? "Saved!" : "Save Preferences"}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}