import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Securely hashes a plain-text password using Node.js scrypt with a unique random salt.
 * Returns formatted string: `${salt}:${hash}`
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString("hex")}`;
}

/**
 * Verifies a plain-text password against a stored scrypt hash (`${salt}:${hash}`).
 * Uses constant-time comparison to protect against timing attacks.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    if (!storedHash || !storedHash.includes(":")) {
      return false;
    }
    const [salt, key] = storedHash.split(":");
    if (!salt || !key) {
      return false;
    }
    const keyBuffer = Buffer.from(key, "hex");
    const derivedKey = scryptSync(password, salt, 64);
    if (keyBuffer.length !== derivedKey.length) {
      return false;
    }
    return timingSafeEqual(keyBuffer, derivedKey);
  } catch {
    return false;
  }
}
