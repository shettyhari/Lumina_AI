import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  Cloud, HardDrive, FolderOpen, File, FileText, FileImage, FileVideo,
  FileAudio, FileSpreadsheet, Download, LogOut, Loader2, AlertCircle,
  ChevronRight, Home, RefreshCw, ExternalLink, CheckCircle2
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DriveStatus {
  connected: boolean;
  email?: string;
  name?: string;
  picture?: string;
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  thumbnailLink?: string;
  iconLink?: string;
}

interface Breadcrumb { id: string; name: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FOLDER_MIME = "application/vnd.google-apps.folder";

function formatBytes(bytes?: string): string {
  if (!bytes) return "";
  const n = parseInt(bytes);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDate(iso?: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function FileIcon({ mimeType, className }: { mimeType: string; className?: string }) {
  const cls = cn("shrink-0", className);
  if (mimeType === FOLDER_MIME) return <FolderOpen className={cn(cls, "text-yellow-400")} />;
  if (mimeType.startsWith("image/")) return <FileImage className={cn(cls, "text-pink-400")} />;
  if (mimeType.startsWith("video/")) return <FileVideo className={cn(cls, "text-violet-400")} />;
  if (mimeType.startsWith("audio/")) return <FileAudio className={cn(cls, "text-cyan-400")} />;
  if (mimeType === "application/pdf") return <FileText className={cn(cls, "text-red-400")} />;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType.includes("google-apps.spreadsheet"))
    return <FileSpreadsheet className={cn(cls, "text-green-400")} />;
  if (mimeType.includes("document") || mimeType.includes("word") || mimeType.includes("google-apps.document"))
    return <FileText className={cn(cls, "text-blue-400")} />;
  return <File className={cn(cls, "text-muted-foreground")} />;
}

// ─── Google Drive file browser ────────────────────────────────────────────────

function DriveBrowser({ basePath }: { basePath: string }) {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([{ id: "root", name: "My Drive" }]);
  const [downloading, setDownloading] = useState<string | null>(null);

  const currentFolder = breadcrumbs[breadcrumbs.length - 1].id;

  const loadFiles = useCallback(async (folderId: string) => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`${basePath}/api/cloud-storage/google/files?folderId=${folderId}`, {
        credentials: "include",
      });
      if (!resp.ok) throw new Error("Failed to load files");
      const data = await resp.json();
      setFiles(data.files ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [basePath]);

  useEffect(() => { loadFiles(currentFolder); }, [currentFolder, loadFiles]);

  const openFolder = (file: DriveFile) => {
    setBreadcrumbs(prev => [...prev, { id: file.id, name: file.name }]);
  };

  const navigateTo = (index: number) => {
    setBreadcrumbs(prev => prev.slice(0, index + 1));
  };

  const downloadFile = async (file: DriveFile) => {
    setDownloading(file.id);
    try {
      const resp = await fetch(`${basePath}/api/cloud-storage/google/download/${file.id}`, {
        credentials: "include",
      });
      if (!resp.ok) throw new Error("Download failed");
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silent
    } finally {
      setDownloading(null);
    }
  };

  const folders = files.filter(f => f.mimeType === FOLDER_MIME);
  const fileItems = files.filter(f => f.mimeType !== FOLDER_MIME);

  return (
    <div className="space-y-4">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-1 flex-wrap">
        {breadcrumbs.map((crumb, i) => (
          <div key={crumb.id} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40" />}
            <button
              onClick={() => navigateTo(i)}
              className={cn(
                "text-sm px-2 py-1 rounded-lg transition-colors",
                i === breadcrumbs.length - 1
                  ? "text-foreground font-medium bg-muted/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/20"
              )}
            >
              {i === 0 ? <Home className="w-3.5 h-3.5 inline -mt-0.5" /> : crumb.name}
            </button>
          </div>
        ))}
        <button
          onClick={() => loadFiles(currentFolder)}
          className="ml-auto text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-muted/20 transition-colors"
          title="Refresh"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
        </button>
      </div>

      {/* Content */}
      {loading && !files.length ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading files…
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-destructive text-sm py-8 justify-center">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      ) : files.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          This folder is empty
        </div>
      ) : (
        <div className="space-y-6">
          {/* Folders */}
          {folders.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider mb-3">Folders</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {folders.map(f => (
                  <button
                    key={f.id}
                    onClick={() => openFolder(f)}
                    className="group flex flex-col items-center gap-2 p-4 rounded-xl border border-border/40 bg-card/60 hover:border-yellow-400/40 hover:bg-yellow-400/5 transition-all text-left"
                  >
                    <FolderOpen className="w-10 h-10 text-yellow-400 group-hover:scale-110 transition-transform" />
                    <span className="text-xs text-foreground/80 text-center line-clamp-2 leading-tight font-medium">{f.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Files */}
          {fileItems.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider mb-3">Files</p>
              <div className="divide-y divide-border/30">
                {fileItems.map(f => (
                  <div
                    key={f.id}
                    className="group flex items-center gap-3 py-3 px-2 rounded-lg hover:bg-muted/20 transition-colors"
                  >
                    <FileIcon mimeType={f.mimeType} className="w-5 h-5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground/90 font-medium truncate">{f.name}</p>
                      <p className="text-xs text-muted-foreground/60 mt-0.5">
                        {[formatBytes(f.size), formatDate(f.modifiedTime)].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <button
                      onClick={() => downloadFile(f)}
                      disabled={downloading === f.id}
                      className="opacity-0 group-hover:opacity-100 flex items-center justify-center w-8 h-8 rounded-lg border border-border/40 bg-card hover:border-primary/40 hover:text-primary transition-all"
                      title="Download"
                    >
                      {downloading === f.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Download className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CloudStoragePage() {
  const [, setLocation] = useLocation();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  const [googleStatus, setGoogleStatus] = useState<DriveStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Read URL params for post-OAuth feedback
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("connected") === "google") {
      setSuccessMsg("Google Drive connected successfully!");
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (url.searchParams.get("error")) {
      setErrorMsg("Connection failed — please try again.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Fetch Google Drive status
  const fetchStatus = async () => {
    setStatusLoading(true);
    try {
      const resp = await fetch(`${basePath}/api/cloud-storage/google/status`, { credentials: "include" });
      if (resp.ok) setGoogleStatus(await resp.json());
    } finally {
      setStatusLoading(false);
    }
  };

  useEffect(() => { fetchStatus(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const connectGoogle = () => {
    window.location.href = `${basePath}/api/cloud-storage/google/auth`;
  };

  const disconnectGoogle = async () => {
    setDisconnecting(true);
    try {
      await fetch(`${basePath}/api/cloud-storage/google/disconnect`, {
        method: "DELETE", credentials: "include",
      });
      setGoogleStatus({ connected: false });
    } finally {
      setDisconnecting(false);
    }
  };

  const notConfigured = googleStatus === null && !statusLoading;

  return (
    <div className="min-h-full bg-background">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">

        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
              <Cloud className="w-5 h-5 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Cloud Storage</h1>
          </div>
          <p className="text-sm text-muted-foreground ml-[52px]">
            Connect your personal cloud accounts. Each family member links their own account — files stay private.
          </p>
        </div>

        {/* Feedback banners */}
        {successMsg && (
          <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3 text-sm text-emerald-400">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {successMsg}
          </div>
        )}
        {errorMsg && (
          <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-3 text-sm text-destructive">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {errorMsg}
          </div>
        )}

        {/* Services */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground/70 uppercase tracking-wider">Connected Accounts</h2>

          {/* Google Drive */}
          <div className={cn(
            "flex items-center gap-4 p-4 rounded-xl border transition-colors",
            googleStatus?.connected
              ? "bg-card border-emerald-500/30"
              : "bg-card/60 border-border/40"
          )}>
            {/* Google icon */}
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/5 border border-border/30 shrink-0">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-foreground text-sm">Google Drive</p>
                {googleStatus?.connected && (
                  <span className="text-[10px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                    Connected
                  </span>
                )}
              </div>
              {statusLoading ? (
                <p className="text-xs text-muted-foreground mt-0.5">Checking status…</p>
              ) : googleStatus?.connected ? (
                <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">{googleStatus.email}</p>
              ) : (
                <p className="text-xs text-muted-foreground/60 mt-0.5">Not connected</p>
              )}
            </div>

            {statusLoading ? (
              <Loader2 className="w-4 h-4 text-muted-foreground animate-spin shrink-0" />
            ) : googleStatus?.connected ? (
              <button
                onClick={disconnectGoogle}
                disabled={disconnecting}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive border border-border/40 hover:border-destructive/40 px-3 py-1.5 rounded-lg transition-colors"
              >
                {disconnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <LogOut className="w-3 h-3" />}
                Disconnect
              </button>
            ) : (
              <button
                onClick={connectGoogle}
                className="flex items-center gap-1.5 text-xs text-primary border border-primary/30 bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-lg transition-colors font-medium"
              >
                Connect
                <ExternalLink className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Dropbox — coming soon */}
          <div className="flex items-center gap-4 p-4 rounded-xl border border-border/30 bg-card/30 opacity-60">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/5 border border-border/30 shrink-0">
              <svg className="w-6 h-6 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2.04L6 5.96 12 9.88 18 5.96 12 2.04zM6 11.8L12 15.72 18 11.8 12 7.88 6 11.8zM12 17.64L6 13.72 0 17.64 6 21.56 12 17.64zM12 17.64L18 21.56 24 17.64 18 13.72 12 17.64z"/>
              </svg>
            </div>
            <div className="flex-1">
              <p className="font-semibold text-foreground text-sm">Dropbox</p>
              <p className="text-xs text-muted-foreground/60 mt-0.5">Coming soon</p>
            </div>
            <span className="text-[10px] text-muted-foreground/50 border border-border/30 px-2 py-0.5 rounded-full">Soon</span>
          </div>

          {/* OneDrive — coming soon */}
          <div className="flex items-center gap-4 p-4 rounded-xl border border-border/30 bg-card/30 opacity-60">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/5 border border-border/30 shrink-0">
              <svg className="w-6 h-6 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/>
              </svg>
            </div>
            <div className="flex-1">
              <p className="font-semibold text-foreground text-sm">Microsoft OneDrive</p>
              <p className="text-xs text-muted-foreground/60 mt-0.5">Coming soon</p>
            </div>
            <span className="text-[10px] text-muted-foreground/50 border border-border/30 px-2 py-0.5 rounded-full">Soon</span>
          </div>
        </div>

        {/* File browser */}
        {googleStatus?.connected && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-foreground/70 uppercase tracking-wider">
              Google Drive — {googleStatus.name ?? googleStatus.email}
            </h2>
            <div className="bg-card/60 border border-border/40 rounded-2xl p-5">
              <DriveBrowser basePath={basePath} />
            </div>
          </div>
        )}

        {/* Setup hint when not connected */}
        {!googleStatus?.connected && !statusLoading && (
          <div className="rounded-xl border border-border/30 bg-muted/10 p-5 text-sm text-muted-foreground space-y-2">
            <p className="font-medium text-foreground/80 flex items-center gap-2">
              <HardDrive className="w-4 h-4" /> How it works
            </p>
            <ul className="space-y-1 list-disc list-inside text-muted-foreground/70 text-xs leading-relaxed">
              <li>Each family member connects their <span className="text-foreground/80">own</span> Google account — files are never shared between accounts.</li>
              <li>Browse, download, and organise files right inside Lina.</li>
              <li>Lina can read your documents to answer questions about them in chat.</li>
              <li>Dropbox and OneDrive support is coming next.</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
