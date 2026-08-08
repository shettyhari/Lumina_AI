import { db, documentFiles } from "@workspace/db";
import { eq } from "drizzle-orm";
import { extractReceiptData, type ReceiptExtraction } from "@workspace/integrations-gemini-ai/receipt";
import { ObjectStorageService } from "./objectStorage";

const storage = new ObjectStorageService();

export class ReceiptParseError extends Error {}

/** Downloads a previously-uploaded document image and runs receipt OCR on it.
 *  Shared by the /budget/receipts/parse route and the parse_receipt_image agent tool. */
export async function parseReceiptDocument(
  clerkUserId: string,
  documentFileId: number,
): Promise<ReceiptExtraction> {
  const [doc] = await db.select().from(documentFiles).where(eq(documentFiles.id, documentFileId));
  if (!doc) throw new ReceiptParseError("Document not found");
  if (doc.clerkUserId !== clerkUserId) throw new ReceiptParseError("Forbidden");
  if (!doc.mimeType.startsWith("image/")) throw new ReceiptParseError("Document is not an image");

  const gcsFile = await storage.getObjectEntityFile(doc.storageKey);
  const downloadRes = await storage.downloadObject(gcsFile);
  const buf = Buffer.from(await downloadRes.arrayBuffer());
  return extractReceiptData(buf.toString("base64"), doc.mimeType);
}
