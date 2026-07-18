import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useUser } from "@clerk/react";
import { Plus, Pin, PinOff, Edit2, Trash2, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const QK = ["/api/notes"];

interface Note {
  id: number;
  clerkUserId: string;
  title: string;
  body: string;
  color: string;
  isPinned: boolean;
  createdAt: string;
  authorName: string;
  authorAvatarUrl: string | null;
}

const COLORS = [
  "#fef08a", "#bbf7d0", "#bfdbfe", "#fecaca",
  "#e9d5ff", "#fed7aa", "#f9a8d4", "#a5f3fc",
];

function NoteCard({ note, currentUserId, onEdit, onDelete, onTogglePin }: {
  note: Note;
  currentUserId?: string;
  onEdit: (n: Note) => void;
  onDelete: (id: number) => void;
  onTogglePin: (n: Note) => void;
}) {
  const isOwn = note.clerkUserId === currentUserId;
  return (
    <div
      className="rounded-xl p-4 shadow-sm flex flex-col gap-2 group relative"
      style={{ backgroundColor: note.color + "22", borderLeft: `3px solid ${note.color}` }}
    >
      {note.isPinned && (
        <span className="absolute top-2 right-2 text-amber-400"><Pin className="h-3.5 w-3.5" /></span>
      )}
      <h3 className="font-semibold text-foreground pr-6 leading-tight">{note.title}</h3>
      {note.body && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{note.body}</p>}
      <div className="flex items-center justify-between mt-1">
        <div className="flex items-center gap-1.5">
          {note.authorAvatarUrl
            ? <img src={note.authorAvatarUrl} className="h-4 w-4 rounded-full" alt="" />
            : <div className="h-4 w-4 rounded-full bg-primary/30 text-[8px] flex items-center justify-center font-bold text-primary">{note.authorName[0]}</div>
          }
          <span className="text-[10px] text-muted-foreground">{note.authorName}</span>
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => onTogglePin(note)} className="p-1 rounded hover:bg-white/20 text-muted-foreground hover:text-foreground">
            {note.isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
          </button>
          {isOwn && <>
            <button onClick={() => onEdit(note)} className="p-1 rounded hover:bg-white/20 text-muted-foreground hover:text-foreground"><Edit2 className="h-3.5 w-3.5" /></button>
            <button onClick={() => onDelete(note.id)} className="p-1 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
          </>}
        </div>
      </div>
    </div>
  );
}

export default function NotesPage() {
  const qc = useQueryClient();
  const { user } = useUser();
  const currentUserId = user?.id;
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Note | null>(null);
  const [form, setForm] = useState({ title: "", body: "", color: COLORS[0] });

  const { data: notes = [], isLoading } = useQuery<Note[]>({
    queryKey: QK,
    queryFn: () => customFetch(`${BASE}/api/notes`),
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => customFetch(`${BASE}/api/notes`, { method: "POST", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: QK }); closeModal(); },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: number } & Record<string, unknown>) => customFetch(`${BASE}/api/notes/${id}`, { method: "PATCH", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: QK }); closeModal(); },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => customFetch(`${BASE}/api/notes/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });

  function openNew() { setEditing(null); setForm({ title: "", body: "", color: COLORS[0] }); setShowModal(true); }
  function openEdit(n: Note) { setEditing(n); setForm({ title: n.title, body: n.body, color: n.color }); setShowModal(true); }
  function closeModal() { setShowModal(false); setEditing(null); }

  function handleSubmit() {
    if (!form.title.trim()) return;
    if (editing) updateMutation.mutate({ id: editing.id, ...form });
    else createMutation.mutate(form);
  }

  function togglePin(n: Note) {
    updateMutation.mutate({ id: n.id, isPinned: !n.isPinned });
  }

  const pinned = notes.filter((n) => n.isPinned);
  const unpinned = notes.filter((n) => !n.isPinned);

  return (
    <div className="flex flex-col h-full overflow-auto p-6 gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pinboard</h1>
          <p className="text-sm text-muted-foreground">Shared sticky notes for the family</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" /> New Note
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
      ) : notes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
          <div className="text-5xl">📝</div>
          <p>No notes yet. Create the first sticky note!</p>
        </div>
      ) : (
        <>
          {pinned.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider mb-3">Pinned</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {pinned.map((n) => <NoteCard key={n.id} note={n} currentUserId={currentUserId} onEdit={openEdit} onDelete={(id) => deleteMutation.mutate(id)} onTogglePin={togglePin} />)}
              </div>
            </div>
          )}
          {unpinned.length > 0 && (
            <div>
              {pinned.length > 0 && <p className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider mb-3">All Notes</p>}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {unpinned.map((n) => <NoteCard key={n.id} note={n} currentUserId={currentUserId} onEdit={openEdit} onDelete={(id) => deleteMutation.mutate(id)} onTogglePin={togglePin} />)}
              </div>
            </div>
          )}
        </>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-foreground">{editing ? "Edit Note" : "New Note"}</h2>
              <button onClick={closeModal} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <input
              className="bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground w-full placeholder:text-muted-foreground"
              placeholder="Title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              autoFocus
            />
            <textarea
              className="bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground w-full resize-none placeholder:text-muted-foreground"
              placeholder="Body (optional)"
              rows={4}
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            />
            <div>
              <p className="text-xs text-muted-foreground mb-2">Color</p>
              <div className="flex gap-2 flex-wrap">
                {COLORS.map((c) => (
                  <button key={c} onClick={() => setForm((f) => ({ ...f, color: c }))}
                    className={cn("h-7 w-7 rounded-full border-2 transition-all", form.color === c ? "border-primary scale-110" : "border-transparent")}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={closeModal} className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:bg-accent">Cancel</button>
              <button onClick={handleSubmit} disabled={!form.title.trim() || createMutation.isPending || updateMutation.isPending}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1">
                <Check className="h-3.5 w-3.5" /> {editing ? "Save" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
