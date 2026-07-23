import { eq, and } from "drizzle-orm";
import { db, userApiKeys } from "@workspace/db";
import { encryptApiKey, decryptApiKey } from "./crypto";

type KeyRecord = {
  provider: string;
  encryptedKey: string;
  createdAt: Date;
  updatedAt: Date;
};

// In-memory fallback map: clerkUserId -> Map(provider -> KeyRecord)
const memoryStore = new Map<string, Map<string, KeyRecord>>();

export function maskKey(plaintext: string): string {
  if (plaintext.length <= 8) return "••••••••";
  return plaintext.slice(0, 4) + "••••••••" + plaintext.slice(-4);
}

export async function getUserApiKeyRecord(clerkUserId: string, provider: string): Promise<string | null> {
  // 1. Try DB query
  try {
    const [row] = await db
      .select()
      .from(userApiKeys)
      .where(and(eq(userApiKeys.clerkUserId, clerkUserId), eq(userApiKeys.provider, provider)));
    if (row?.encryptedKey) {
      return decryptApiKey(row.encryptedKey);
    }
  } catch {
    // DB unreachable, check memory store
  }

  // 2. Memory store fallback
  const userMap = memoryStore.get(clerkUserId);
  const memRecord = userMap?.get(provider);
  if (memRecord) {
    try {
      return decryptApiKey(memRecord.encryptedKey);
    } catch {
      return null;
    }
  }

  return null;
}

export async function listUserApiKeysRecords(clerkUserId: string): Promise<Array<{ provider: string; maskedKey: string; createdAt: Date }>> {
  let dbRows: any[] = [];
  try {
    dbRows = await db
      .select()
      .from(userApiKeys)
      .where(eq(userApiKeys.clerkUserId, clerkUserId));
  } catch {
    dbRows = [];
  }

  const resultsMap = new Map<string, { provider: string; maskedKey: string; createdAt: Date }>();

  // Add DB rows
  for (const k of dbRows) {
    let decrypted = "";
    try { decrypted = decryptApiKey(k.encryptedKey); } catch { decrypted = ""; }
    resultsMap.set(k.provider, {
      provider: k.provider,
      maskedKey: maskKey(decrypted),
      createdAt: k.createdAt ?? new Date(),
    });
  }

  // Merge memory store rows
  const memMap = memoryStore.get(clerkUserId);
  if (memMap) {
    for (const [provider, record] of memMap.entries()) {
      let decrypted = "";
      try { decrypted = decryptApiKey(record.encryptedKey); } catch { decrypted = ""; }
      resultsMap.set(provider, {
        provider,
        maskedKey: maskKey(decrypted),
        createdAt: record.createdAt,
      });
    }
  }

  return Array.from(resultsMap.values());
}

export async function saveUserApiKeyRecord(clerkUserId: string, provider: string, key: string): Promise<{ provider: string; maskedKey: string; createdAt: Date }> {
  const encrypted = encryptApiKey(key);
  const masked = maskKey(key);
  const now = new Date();

  // Always save to memory store as reliable fallback
  let userMap = memoryStore.get(clerkUserId);
  if (!userMap) {
    userMap = new Map();
    memoryStore.set(clerkUserId, userMap);
  }
  userMap.set(provider, {
    provider,
    encryptedKey: encrypted,
    createdAt: now,
    updatedAt: now,
  });

  // Also try persisting to DB if available
  try {
    const existing = await db
      .select()
      .from(userApiKeys)
      .where(and(eq(userApiKeys.clerkUserId, clerkUserId), eq(userApiKeys.provider, provider)));

    if (existing.length > 0) {
      await db.update(userApiKeys)
        .set({ encryptedKey: encrypted, updatedAt: now })
        .where(and(eq(userApiKeys.clerkUserId, clerkUserId), eq(userApiKeys.provider, provider)));
    } else {
      await db.insert(userApiKeys).values({ clerkUserId, provider, encryptedKey: encrypted });
    }
  } catch {
    // Persistent DB unavailable, stored in memory
  }

  return { provider, maskedKey: masked, createdAt: now };
}

export async function deleteUserApiKeyRecord(clerkUserId: string, provider: string): Promise<void> {
  const userMap = memoryStore.get(clerkUserId);
  if (userMap) {
    userMap.delete(provider);
  }

  try {
    await db.delete(userApiKeys)
      .where(and(eq(userApiKeys.clerkUserId, clerkUserId), eq(userApiKeys.provider, provider)));
  } catch {
    // Ignore DB errors
  }
}
