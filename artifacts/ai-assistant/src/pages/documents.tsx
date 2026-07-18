import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useFamilyStatus } from "@/contexts/family-context";
import { Upload, Download, Trash2, FileText, Image, File, Users, User, X } from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const MAX_BYTES = 25 * 1024 * 1024;

interface DocFile {
  id: number;
  clerkUserId: string;
  folder: string;
  filename: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  uploaderName: string;
  uploaderAvatarUrl: string | null;
}
interface Usage { usedBytes: number; quotaBytes: number; }

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function FileIcon({ mime }: { mime: string }) {
  if (mime.startsWith("image/")) return <Image className="h-4 w-4 text-blue-400" />;
  if (mime === "application/pdf") return <FileText className="h-4 w-4 text-red-400" />;
  return <File className="h-4 w-4 text-muted-foreground" />;
}

export default function DocumentsPage() {
  const qc = useQueryClient();
  const { isAdmin } = useFamilyStatus();
  const [tab, setTab] = useState<"family" | "personal">("family");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const docsKey = ["/api/documents", tab];
  const usageKey = ["/api/documents/usage"];

  const { data: docs = [], isLoading } = useQuery<DocFile[]>({
    queryKey: docsKey,
    queryFn: () => customFetch(`${BASE}/api/documents?folder=${tab}`),
  });
  const { data: usage } = useQuery<Usage>({
    queryKey: usageKey,
    queryFn: () => customFetch(`${BASE}/api/documents/usage`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => customFetch(`${BASE}/api/documents/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/documents"] }); qc.invalidateQueries({ queryKey: usageKey }); },
  });

  async function handleUpload(file: File) {
    if (file.size > MAX_BYTES) { setUploadError("File too large (max 25 MB)"); return; }
    setUploading(true); setUploadError(null);
    try {
      // Step 1: get presigned URL
      const urlRes: { uploadURL: string; objectPath: string } = await customFetch(`${BASE}/api/documents/upload-url`, {
        method: "POST",
        body: JSON.stringify({ filename: file.name, mimeType: file.type || "application/octet-stream", sizeBytes: file.size, folder: tab }),
        headers: { "Content-Type": "application/json" },
      });
      // Step 2: upload directly to GCS
      const uploadRes = await fetch(urlRes.uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
      if (!uploadRes.ok) throw new Error("Upload to storage failed");
      // Step 3: register in DB
      await customFetch(`${BASE}/api/documents/register`, {
        method: "POST",
        body: JSON.stringify({ filename: file.name, storageKey: urlRes.objectPath, mimeType: file.type || "application/octet-stream", sizeBytes: file.size, folder: tab }),
        headers: { "Content-Type": "application/json" },
      });
      qc.invalidateQueries({ queryKey: ["/api/documents"] });
      qc.invalidateQueries({ queryKey: usageKey });
    } catch (e: any) {
      setUploadError(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function handleDownload(doc: DocFile) {
    const a = document.createElement("a");
    a.href = `${BASE}/api/documents/${doc.id}/download`;
    a.download = doc.filename;
    a.click();
  }

  const usedBytes = usage?.usedBytes ?? 0;
  const quotaBytes = usage?.quotaBytes ?? 0;
  const usagePct = quotaBytes > 0 ? Math.min(100, (usedBytes / quotaBytes) * 100) : 0;

  return (
    <div className="flex flex-col h-full overflow-auto p-6 gap-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Document Vault</h1>
          <p className="text-sm text-muted-foreground">Receipts, IDs, warranties and family files</p>
        </div>
        <div>
          <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp" className="hidden"
            onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
            <Upload className="h-4 w-4" /> {uploading ? "Uploading…" : "Upload File"}
          </button>
        </div>
      </div>

      {uploadError && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg px-4 py-3 flex items-center justify-between text-sm text-destructive">
          {uploadError}
          <button onClick={() => setUploadError(null)}><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-accent/30 rounded-lg p-1 w-fit">
        {([["family", Users, "Family"], ["personal", User, "Mine"]] as const).map(([key, Icon, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn("flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
              tab === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
      ) : docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
          <div className="text-5xl">📁</div>
          <p>No files in the {tab === "family" ? "family" : "personal"} folder yet.</p>
          <p className="text-xs">Upload PDFs, images, or documents (max 25 MB each)</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-accent/20">
              <tr>
                {["File", "Uploaded by", "Date", "Size", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {docs.map((doc) => (
                <tr key={doc.id} className="hover:bg-accent/10 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FileIcon mime={doc.mimeType} />
                      <span className="text-foreground font-medium truncate max-w-[200px]">{doc.filename}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {doc.uploaderAvatarUrl
                        ? <img src={doc.uploaderAvatarUrl} className="h-5 w-5 rounded-full" alt="" />
                        : <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center text-[9px] font-bold text-primary">{doc.uploaderName[0]}</div>
                      }
                      <span className="text-muted-foreground">{doc.uploaderName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {new Date(doc.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtSize(doc.sizeBytes)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => handleDownload(doc)} className="p-1.5 rounded text-muted-foreground hover:text-primary hover:bg-primary/10">
                        <Download className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => deleteMutation.mutate(doc.id)} className="p-1.5 rounded text-muted-foreground hover:text-red-400 hover:bg-red-400/10">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Storage usage bar */}
      {quotaBytes > 0 && (
        <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Storage Used</span>
            <span>{fmtSize(usedBytes)} / {fmtSize(quotaBytes)}</span>
          </div>
          <div className="h-2 bg-accent rounded-full overflow-hidden">
            <div className={cn("h-full rounded-full transition-all", usagePct > 90 ? "bg-red-400" : usagePct > 70 ? "bg-amber-400" : "bg-primary")}
              style={{ width: `${usagePct}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}
