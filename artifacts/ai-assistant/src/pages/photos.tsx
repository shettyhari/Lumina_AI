import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useUser } from "@clerk/react";
import { Image, Upload, X, Trash2, ZoomIn } from "lucide-react";
import { cn } from "@/lib/utils";

interface PhotoFile { id: number; clerkUserId: string; fileName: string; fileKey: string; fileSize: number; fileType: string; uploadedAt: string; folder?: string; }

const MAX_SIZE_MB = 10;

export default function PhotosPage() {
  const qc = useQueryClient();
  const { user } = useUser();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState("");

  const { data: allDocs = [] } = useQuery<PhotoFile[]>({
    queryKey: ["photos"],
    queryFn: () => customFetch("/api/documents?folder=photos"),
  });

  const photos = allDocs.filter(d => d.fileType?.startsWith("image/") || d.folder === "photos");

  const deleteMutation = useMutation({
    mutationFn: (id: number) => customFetch(`/api/documents/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["photos"] }),
  });

  async function handleUpload(file: File) {
    if (!file.type.startsWith("image/")) { alert("Please select an image file."); return; }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) { alert(`File too large. Max ${MAX_SIZE_MB}MB.`); return; }
    setUploading(true);
    setUploadProgress("Getting upload URL...");
    try {
      const { uploadUrl, fileKey } = await customFetch("/api/documents/upload-url", {
        method: "POST",
        body: JSON.stringify({ fileName: file.name, fileType: file.type, fileSize: file.size, folder: "photos" }),
        headers: { "Content-Type": "application/json" },
      }) as any;
      setUploadProgress("Uploading photo...");
      await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      setUploadProgress("Saving...");
      await customFetch("/api/documents/register", {
        method: "POST",
        body: JSON.stringify({ fileName: file.name, fileType: file.type, fileSize: file.size, fileKey, folder: "photos" }),
        headers: { "Content-Type": "application/json" },
      });
      qc.invalidateQueries({ queryKey: ["photos"] });
    } catch (e) {
      alert("Upload failed. Please try again.");
    } finally {
      setUploading(false);
      setUploadProgress("");
    }
  }

  return (
    <div className="min-h-screen bg-background p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Image className="h-6 w-6 text-primary" /> Family Photos</h1>
          <p className="text-muted-foreground text-sm mt-1">{photos.length} photos shared with the family</p>
        </div>
        <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          <Upload className="h-4 w-4" />{uploading ? uploadProgress : "Upload Photo"}
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ""; }} />
      </div>

      {photos.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Image className="h-16 w-16 mx-auto mb-4 opacity-20" />
          <p className="font-medium text-lg">No photos yet</p>
          <p className="text-sm mt-1">Upload your first family photo to share with everyone.</p>
          <button onClick={() => fileInputRef.current?.click()} className="mt-4 rounded-lg bg-primary/10 px-6 py-2 text-sm font-medium text-primary hover:bg-primary/20">
            Upload Photo
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {photos.map(photo => (
            <div key={photo.id} className="group relative rounded-xl overflow-hidden border bg-muted aspect-square">
              <PhotoThumbnail photo={photo} onExpand={() => setLightbox(`/api/documents/${photo.id}/download`)} />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-3 opacity-0 group-hover:opacity-100">
                <button onClick={() => setLightbox(`/api/documents/${photo.id}/download`)} className="rounded-full bg-white/90 p-2 text-black hover:bg-white">
                  <ZoomIn className="h-4 w-4" />
                </button>
                {photo.clerkUserId === user?.id && (
                  <button onClick={() => deleteMutation.mutate(photo.id)} className="rounded-full bg-white/90 p-2 text-red-600 hover:bg-white">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2 translate-y-full group-hover:translate-y-0 transition-transform">
                <p className="text-xs text-white truncate">{photo.fileName}</p>
                <p className="text-xs text-white/70">{new Date(photo.uploadedAt).toLocaleDateString()}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 text-white/70 hover:text-white" onClick={() => setLightbox(null)}>
            <X className="h-8 w-8" />
          </button>
          <img src={lightbox} alt="Photo" className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

function PhotoThumbnail({ photo, onExpand }: { photo: PhotoFile; onExpand: () => void }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  return (
    <>
      {!loaded && !error && <div className="absolute inset-0 bg-muted animate-pulse" />}
      {error ? (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground"><Image className="h-8 w-8 opacity-30" /></div>
      ) : (
        <img src={`/api/documents/${photo.id}/download`} alt={photo.fileName} className={cn("absolute inset-0 w-full h-full object-cover transition-opacity", loaded ? "opacity-100" : "opacity-0")} onLoad={() => setLoaded(true)} onError={() => setError(true)} />
      )}
    </>
  );
}
