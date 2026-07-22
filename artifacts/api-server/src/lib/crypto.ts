import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const SALT = "lumina-api-keys-salt-v1"; // static salt — key derivation only

function getDerivedKey(): Buffer {
  const secret = process.env.SESSION_SECRET || "lumina_default_secret_key_2026_dev";
  return scryptSync(secret, SALT, KEY_LENGTH);
}

export function encryptApiKey(plaintext: string): string {
  const key = getDerivedKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: iv(12) + tag(16) + ciphertext — all hex encoded
  return Buffer.concat([iv, tag, encrypted]).toString("hex");
}

export function decryptApiKey(hex: string): string {
  const key = getDerivedKey();
  const data = Buffer.from(hex, "hex");
  const iv = data.subarray(0, IV_LENGTH);
  const tag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = data.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
