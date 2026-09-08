import { db, documentFiles } from "@workspace/db";
import { eq } from "drizzle-orm";
import { extractGroceryPhotoItems, type GroceryPhotoExtraction } from "@workspace/integrations-gemini-ai/groceryPhoto";
import { ObjectStorageService } from "./objectStorage";

const storage = new ObjectStorageService();

export class GroceryPhotoParseError extends Error {}

/** Downloads a previously-uploaded photo and identifies grocery items in it.
 *  Shared shape with receiptParsing.ts's parseReceiptDocument, but a
 *  different vision prompt — this reads what's actually in the photo
 *  (items on a counter/in bags), not a receipt's printed line items. */
export async function parseGroceryPhoto(
  clerkUserId: string,
  documentFileId: number,
): Promise<GroceryPhotoExtraction> {
  const [doc] = await db.select().from(documentFiles).where(eq(documentFiles.id, documentFileId));
  if (!doc) throw new GroceryPhotoParseError("Document not found");
  if (doc.clerkUserId !== clerkUserId) throw new GroceryPhotoParseError("Forbidden");
  if (!doc.mimeType.startsWith("image/")) throw new GroceryPhotoParseError("Document is not an image");

  const gcsFile = await storage.getObjectEntityFile(doc.storageKey);
  const downloadRes = await storage.downloadObject(gcsFile);
  const buf = Buffer.from(await downloadRes.arrayBuffer());
  return extractGroceryPhotoItems(buf.toString("base64"), doc.mimeType);
}
