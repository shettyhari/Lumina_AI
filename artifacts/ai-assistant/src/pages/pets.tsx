import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { PawPrint, Plus, X, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Pet { id: number; name: string; species: string; breed?: string; birthday?: string; avatarEmoji: string; notes?: string; }
interface PetCareLog { id: number; petId: number; clerkUserId: string; type: string; notes?: string; completedAt: string; }

const CARE_TYPES = [
  { type: "feeding", emoji: "🍖", label: "Fed" },
  { type: "walk", emoji: "🦮", label: "Walk" },
  { type: "medication", emoji: "💊", label: "Meds" },
  { type: "vet", emoji: "🏥", label: "Vet" },
  { type: "grooming", emoji: "✂️", label: "Groomed" },
  { type: "other", emoji: "❤️", label: "Other" },
];

const SPECIES_EMOJIS: Record<string, string> = { dog: "🐕", cat: "🐈", fish: "🐟", bird: "🦜", rabbit: "🐇", hamster: "🐹", other: "🐾" };

export default function PetsPage() {
  const qc = useQueryClient();
  const [selectedPet, setSelectedPet] = useState<Pet | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [logNote, setLogNote] = useState("");
  const [form, setForm] = useState({ name: "", species: "dog", breed: "", birthday: "", avatarEmoji: "🐕", notes: "" });

  const { data: pets = [] } = useQuery<Pet[]>({ queryKey: ["pets"], queryFn: () => customFetch("/api/pets") });
  const { data: logs = [] } = useQuery<PetCareLog[]>({
    queryKey: ["pet-logs", selectedPet?.id],
    queryFn: () => customFetch(`/api/pets/${selectedPet!.id}/logs`),
    enabled: !!selectedPet,
  });

  const addPetMutation = useMutation({
    mutationFn: (body: object) => customFetch("/api/pets", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pets"] }); setShowAdd(false); setForm({ name: "", species: "dog", breed: "", birthday: "", avatarEmoji: "🐕", notes: "" }); },
  });

  const deletePetMutation = useMutation({
    mutationFn: (id: number) => customFetch(`/api/pets/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pets"] }); setSelectedPet(null); },
  });

  const logMutation = useMutation({
    mutationFn: ({ type }: { type: string }) => customFetch(`/api/pets/${selectedPet!.id}/logs`, { method: "POST", body: JSON.stringify({ type, notes: logNote || undefined }), headers: { "Content-Type": "application/json" } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pet-logs", selectedPet?.id] }); setLogNote(""); },
  });

  return (
    <div className="min-h-screen bg-background p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2"><PawPrint className="h-6 w-6 text-primary" /> Pet Care</h1>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"><Plus className="h-4 w-4" /> Add Pet</button>
      </div>

      {pets.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><PawPrint className="h-12 w-12 mx-auto mb-3 opacity-20" /><p className="font-medium">No pets added yet</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Pet list */}
          <div className="space-y-3">
            {pets.map(pet => (
              <button key={pet.id} onClick={() => setSelectedPet(pet)} className={cn("w-full rounded-xl border bg-card p-4 flex items-center gap-3 text-left transition-colors", selectedPet?.id === pet.id && "border-primary bg-primary/5")}>
                <span className="text-3xl">{pet.avatarEmoji || SPECIES_EMOJIS[pet.species] || "🐾"}</span>
                <div>
                  <p className="font-medium">{pet.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{pet.species}{pet.breed && ` · ${pet.breed}`}</p>
                </div>
              </button>
            ))}
          </div>

          {/* Care panel */}
          {selectedPet ? (
            <div className="md:col-span-2 rounded-xl border bg-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-4xl">{selectedPet.avatarEmoji || SPECIES_EMOJIS[selectedPet.species] || "🐾"}</span>
                  <div>
                    <h2 className="text-xl font-bold">{selectedPet.name}</h2>
                    <p className="text-sm text-muted-foreground capitalize">{selectedPet.species}{selectedPet.breed && ` · ${selectedPet.breed}`}</p>
                  </div>
                </div>
                <button onClick={() => deletePetMutation.mutate(selectedPet.id)} className="rounded-lg p-2 text-muted-foreground hover:text-red-500 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button>
              </div>

              <p className="text-sm font-medium mb-2">Quick log</p>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {CARE_TYPES.map(ct => (
                  <button key={ct.type} onClick={() => logMutation.mutate({ type: ct.type })} className="rounded-lg bg-muted hover:bg-muted/80 px-3 py-2 text-sm font-medium flex flex-col items-center gap-1">
                    <span className="text-xl">{ct.emoji}</span>
                    <span className="text-xs">{ct.label}</span>
                  </button>
                ))}
              </div>

              <input className="w-full rounded-lg border bg-background px-3 py-2 text-sm mb-4" placeholder="Add note (optional)" value={logNote} onChange={e => setLogNote(e.target.value)} />

              <p className="text-sm font-medium mb-2">Recent care</p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {logs.length === 0 ? <p className="text-sm text-muted-foreground">No logs yet.</p>
                : logs.map(log => {
                  const ct = CARE_TYPES.find(c => c.type === log.type);
                  return (
                    <div key={log.id} className="flex items-center gap-3 text-sm">
                      <span className="text-lg">{ct?.emoji ?? "❤️"}</span>
                      <div>
                        <span className="font-medium">{ct?.label ?? log.type}</span>
                        {log.notes && <span className="text-muted-foreground"> · {log.notes}</span>}
                      </div>
                      <span className="ml-auto text-xs text-muted-foreground">{new Date(log.completedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="md:col-span-2 rounded-xl border border-dashed bg-muted/20 flex items-center justify-center text-muted-foreground p-8">
              Select a pet to view care history
            </div>
          )}
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-semibold">Add Pet</h2><button onClick={() => setShowAdd(false)}><X className="h-5 w-5" /></button></div>
            <div className="space-y-3">
              <div className="flex gap-3">
                <input className="w-16 rounded-lg border bg-background px-3 py-2 text-center text-2xl" value={form.avatarEmoji} onChange={e => setForm(f => ({ ...f, avatarEmoji: e.target.value }))} />
                <input className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm" placeholder="Pet name *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <select className="w-full rounded-lg border bg-background px-3 py-2 text-sm" value={form.species} onChange={e => setForm(f => ({ ...f, species: e.target.value }))}>
                {Object.entries(SPECIES_EMOJIS).map(([s, e]) => <option key={s} value={s}>{e} {s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
              <input className="w-full rounded-lg border bg-background px-3 py-2 text-sm" placeholder="Breed (optional)" value={form.breed} onChange={e => setForm(f => ({ ...f, breed: e.target.value }))} />
              <div><label className="text-xs text-muted-foreground">Birthday</label><input type="date" className="w-full rounded-lg border bg-background px-3 py-2 text-sm" value={form.birthday} onChange={e => setForm(f => ({ ...f, birthday: e.target.value }))} /></div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowAdd(false)} className="flex-1 rounded-lg border px-4 py-2 text-sm">Cancel</button>
              <button disabled={!form.name || addPetMutation.isPending} onClick={() => addPetMutation.mutate({ ...form, birthday: form.birthday || undefined })} className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
                {addPetMutation.isPending ? "Adding..." : "Add Pet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
