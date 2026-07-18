import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useFamilyStatus } from "@/contexts/family-context";
import { Plus, Edit2, Trash2, X, Eye, EyeOff, AlertTriangle } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const QK = ["/api/emergency/contacts"];

interface EmergencyContact {
  id: number;
  name: string;
  relationship: string;
  phone: string;
  notes: string | null;
  priority: number;
}

const EMPTY_FORM = { name: "", relationship: "", phone: "", notes: "", priority: "10" };

export default function EmergencyPage() {
  const qc = useQueryClient();
  const { isAdmin } = useFamilyStatus();
  const [showSOS, setShowSOS] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<EmergencyContact | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [revealedIds, setRevealedIds] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);

  const { data: contacts = [], isLoading } = useQuery<EmergencyContact[]>({
    queryKey: QK,
    queryFn: () => customFetch(`${BASE}/api/emergency/contacts`),
  });

  const top = contacts[0];

  const saveMutation = useMutation({
    mutationFn: (data: typeof EMPTY_FORM & { id?: number }) => {
      const { id, ...body } = data;
      const url = id ? `${BASE}/api/emergency/contacts/${id}` : `${BASE}/api/emergency/contacts`;
      return customFetch(url, { method: id ? "PATCH" : "POST", body: JSON.stringify({ ...body, priority: parseInt(body.priority) }), headers: { "Content-Type": "application/json" } });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: QK }); closeModal(); },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => customFetch(`${BASE}/api/emergency/contacts/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });

  function openNew() { setEditing(null); setForm(EMPTY_FORM); setShowModal(true); }
  function openEdit(c: EmergencyContact) { setEditing(c); setForm({ name: c.name, relationship: c.relationship, phone: c.phone, notes: c.notes ?? "", priority: String(c.priority) }); setShowModal(true); }
  function closeModal() { setShowModal(false); setEditing(null); }

  function maskPhone(phone: string) {
    if (phone.length <= 4) return phone;
    return phone.slice(0, 2) + "•".repeat(phone.length - 4) + phone.slice(-2);
  }

  function handleCopy() {
    if (top?.phone) { navigator.clipboard.writeText(top.phone); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  }

  return (
    <div className="flex flex-col h-full overflow-auto p-6 gap-6">
      {/* SOS Banner */}
      <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-5 flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-lg font-bold text-red-400 flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> Emergency</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Press 🆘 for emergency info & checklist</p>
        </div>
        <button onClick={() => setShowSOS(true)}
          className="bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl px-6 py-3 text-lg shadow-lg shadow-red-500/20 transition-all active:scale-95">
          🆘 Emergency
        </button>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Emergency Contacts</h1>
          <p className="text-sm text-muted-foreground">{contacts.length} contact{contacts.length !== 1 ? "s" : ""}, sorted by priority</p>
        </div>
        {isAdmin && (
          <button onClick={openNew} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <Plus className="h-4 w-4" /> Add Contact
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
      ) : contacts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
          <div className="text-5xl">📞</div>
          {isAdmin ? <p>No contacts yet. Add the first emergency contact.</p> : <p>No emergency contacts have been added yet.</p>}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {contacts.map((c, i) => (
            <div key={c.id} className="bg-card border border-border rounded-xl p-4 flex flex-col gap-2">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-primary bg-primary/10 rounded px-1.5 py-0.5">#{i + 1}</span>
                    <h3 className="font-semibold text-foreground">{c.name}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">{c.relationship}</p>
                </div>
                {isAdmin && (
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(c)} className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"><Edit2 className="h-3.5 w-3.5" /></button>
                    <button onClick={() => deleteMutation.mutate(c.id)} className="p-1.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <code className="text-sm font-mono text-foreground">
                  {revealedIds.has(c.id) ? c.phone : maskPhone(c.phone)}
                </code>
                <button onClick={() => setRevealedIds((s) => { const n = new Set(s); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })}
                  className="text-muted-foreground hover:text-foreground">
                  {revealedIds.has(c.id) ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
              {c.notes && <p className="text-xs text-muted-foreground border-t border-border pt-2">{c.notes}</p>}
            </div>
          ))}
        </div>
      )}

      {/* SOS Modal */}
      {showSOS && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="bg-card border border-red-500/40 rounded-2xl w-full max-w-md p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-red-400">🆘 Emergency Mode</h2>
              <button onClick={() => setShowSOS(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <div className="bg-red-500/10 rounded-xl p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Primary Contact</p>
              <p className="font-bold text-foreground text-lg">{top?.name ?? "No contact"}</p>
              <p className="text-muted-foreground text-sm">{top?.relationship}</p>
              <code className="text-2xl font-mono text-red-400 block mt-2">{top?.phone ?? "—"}</code>
            </div>
            <button onClick={handleCopy} className="bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl py-3 transition-all">
              {copied ? "✓ Copied!" : "📋 Copy Phone Number"}
            </button>
            <div className="bg-accent/30 rounded-xl p-4">
              <p className="text-sm font-semibold text-foreground mb-2">Safety Checklist</p>
              <ul className="text-sm text-muted-foreground space-y-1">
                {["Call 911 for life-threatening emergencies", "Stay calm and speak clearly", "Give your address to the dispatcher", "Do not hang up until told to", "Unlock the front door if safe to do so"].map((item, i) => (
                  <li key={i} className="flex items-start gap-2"><span className="text-red-400 font-bold mt-0.5">{i + 1}.</span>{item}</li>
                ))}
              </ul>
            </div>
            <a href="tel:911" className="block text-center bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl py-3 text-lg transition-all">
              📞 Call 911
            </a>
          </div>
        </div>
      )}

      {/* Admin Edit Modal */}
      {showModal && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-foreground">{editing ? "Edit Contact" : "New Contact"}</h2>
              <button onClick={closeModal} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            {[
              { label: "Name", key: "name", placeholder: "e.g. Dr. Smith" },
              { label: "Relationship", key: "relationship", placeholder: "e.g. Family Doctor" },
              { label: "Phone", key: "phone", placeholder: "+1 555-000-0000", type: "tel" },
            ].map(({ label, key, placeholder, type }) => (
              <div key={key}>
                <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
                <input type={type ?? "text"} placeholder={placeholder}
                  className="bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground w-full placeholder:text-muted-foreground"
                  value={(form as any)[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
              </div>
            ))}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Priority (lower = shown first)</label>
              <input type="number" min="1" placeholder="10"
                className="bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground w-full"
                value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Notes (optional)</label>
              <textarea rows={2} placeholder="Additional info..."
                className="bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground w-full resize-none placeholder:text-muted-foreground"
                value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={closeModal} className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:bg-accent">Cancel</button>
              <button onClick={() => saveMutation.mutate(editing ? { ...form, id: editing.id } : form)}
                disabled={!form.name || !form.phone || saveMutation.isPending}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {editing ? "Save" : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
