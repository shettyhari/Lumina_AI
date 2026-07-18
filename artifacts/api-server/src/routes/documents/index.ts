import { Router, type IRouter } from "express";
import { eq, and, or, sql } from "drizzle-orm";
import { db, documentFiles, familyMembers } from "@workspace/db";
import { requireAuth } from "../../middlewares/requireAuth";
import { ObjectStorageService, ObjectNotFoundError } from "../../lib/objectStorage";

const router: IRouter = Router();
const storage = new ObjectStorageService();
const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB

async function getMember(clerkUserId: string) {
  const [m] = await db.select().from(familyMembers).where(eq(familyMembers.clerkUserId, clerkUserId));
  return m;
}

// Request a presigned upload URL (enforces quota)
router.post("/documents/upload-url", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const { filename, mimeType = "application/octet-stream", sizeBytes, folder = "personal" } = req.body ?? {};

  if (!filename) { res.status(400).json({ error: "filename is required" }); return; }
  if (!sizeBytes || sizeBytes <= 0) { res.status(400).json({ error: "sizeBytes must be positive" }); return; }
  if (sizeBytes > MAX_FILE_BYTES) { res.status(400).json({ error: "File too large (max 25 MB)" }); return; }
  if (!["personal", "family"].includes(folder)) { res.status(400).json({ error: "folder must be personal or family" }); return; }

  // Quota check
  const member = await getMember(clerkUserId);
  if (member) {
    const quota = Number(member.storageQuotaBytes ?? 0);
    const used = Number(member.storageUsedBytes ?? 0);
    if (quota > 0 && used + sizeBytes > quota) {
      res.status(400).json({ error: `Storage quota exceeded (${Math.round(used / 1024 / 1024)} MB used of ${Math.round(quota / 1024 / 1024)} MB)` }); return;
    }
  }

  try {
    const uploadURL = await storage.getObjectEntityUploadURL();
    // Extract the objectPath from the signed URL
    const url = new URL(uploadURL);
    const rawPath = url.pathname;
    const objectPath = storage.normalizeObjectEntityPath(uploadURL);
    res.json({ uploadURL, objectPath });
  } catch {
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

// Register a file after successful upload
router.post("/documents/register", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const { filename, storageKey, mimeType = "application/octet-stream", sizeBytes = 0, folder = "personal" } = req.body ?? {};
  if (!filename || !storageKey) { res.status(400).json({ error: "filename and storageKey are required" }); return; }

  const [file] = await db.insert(documentFiles).values({
    clerkUserId, folder, filename: String(filename), storageKey: String(storageKey),
    mimeType: String(mimeType), sizeBytes: parseInt(sizeBytes) || 0,
  }).returning();

  // Update storage used
  await db.update(familyMembers)
    .set({ storageUsedBytes: sql`storage_used_bytes + ${parseInt(sizeBytes) || 0}` })
    .where(eq(familyMembers.clerkUserId, clerkUserId));

  res.status(201).json(file);
});

// List files (folder filter optional)
router.get("/documents", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const folder = req.query.folder as string | undefined;

  let files: typeof documentFiles.$inferSelect[];
  if (folder === "family") {
    files = await db.select().from(documentFiles).where(eq(documentFiles.folder, "family"))
      .orderBy(sql`created_at DESC`);
  } else if (folder === "personal") {
    files = await db.select().from(documentFiles)
      .where(and(eq(documentFiles.folder, "personal"), eq(documentFiles.clerkUserId, clerkUserId)))
      .orderBy(sql`created_at DESC`);
  } else {
    // All accessible: family folder + own personal
    files = await db.select().from(documentFiles)
      .where(or(eq(documentFiles.folder, "family"), eq(documentFiles.clerkUserId, clerkUserId)))
      .orderBy(sql`created_at DESC`);
  }

  const members = await db.select().from(familyMembers);
  const map = Object.fromEntries(members.map((m) => [m.clerkUserId, m]));
  const enriched = files.map((f) => ({
    ...f,
    uploaderName: map[f.clerkUserId]?.displayName ?? map[f.clerkUserId]?.email?.split("@")[0] ?? "Member",
    uploaderAvatarUrl: map[f.clerkUserId]?.avatarUrl ?? null,
  }));

  res.json(enriched);
});

// Download a file (proxy from GCS)
router.get("/documents/:id/download", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [file] = await db.select().from(documentFiles).where(eq(documentFiles.id, id));
  if (!file) { res.status(404).json({ error: "Not found" }); return; }
  // Personal files: only owner; family files: anyone
  if (file.folder === "personal" && file.clerkUserId !== clerkUserId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  try {
    const gcsFile = await storage.getObjectEntityFile(file.storageKey);
    const downloadRes = await storage.downloadObject(gcsFile);
    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
    const buf = Buffer.from(await downloadRes.arrayBuffer());
    res.send(buf);
  } catch (err) {
    if (err instanceof ObjectNotFoundError) { res.status(404).json({ error: "File not found in storage" }); return; }
    res.status(500).json({ error: "Failed to download file" });
  }
});

// Delete a file (owner or admin)
router.delete("/documents/:id", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [file] = await db.select().from(documentFiles).where(eq(documentFiles.id, id));
  if (!file) { res.status(404).json({ error: "Not found" }); return; }

  const member = await getMember(clerkUserId);
  const isAdmin = member?.role === "admin";
  if (!isAdmin && file.clerkUserId !== clerkUserId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  await db.delete(documentFiles).where(eq(documentFiles.id, id));

  // Update storage used
  await db.update(familyMembers)
    .set({ storageUsedBytes: sql`GREATEST(0, storage_used_bytes - ${file.sizeBytes})` })
    .where(eq(familyMembers.clerkUserId, file.clerkUserId));

  res.status(204).end();
});

// Storage usage for current user
router.get("/documents/usage", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const member = await getMember(clerkUserId);
  res.json({
    usedBytes: Number(member?.storageUsedBytes ?? 0),
    quotaBytes: Number(member?.storageQuotaBytes ?? 0),
  });
});

export default router;
