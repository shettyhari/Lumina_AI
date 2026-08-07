import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const DEV_ONLY_FALLBACK_SECRET = "lumina_dev_only_insecure_jwt_secret";

function resolveJwtSecret(): string {
  const configured = process.env.JWT_SECRET || process.env.SESSION_SECRET;
  if (configured) return configured;

  if (process.env.NODE_ENV === "production") {
    // A guessable default secret would let anyone forge valid session
    // tokens. Fail loudly instead of silently signing with a known value.
    throw new Error(
      "JWT_SECRET (or SESSION_SECRET) environment variable must be set in production.",
    );
  }

  console.warn(
    "[auth] JWT_SECRET not set — using an insecure random secret for this dev process only. " +
    "Sessions will not persist across restarts. Set JWT_SECRET before deploying.",
  );
  return `${DEV_ONLY_FALLBACK_SECRET}_${randomBytes(16).toString("hex")}`;
}

const JWT_SECRET = resolveJwtSecret();

export interface SessionPayload {
  userId: string;
  email: string;
  displayName?: string;
  role?: string;
  iat?: number;
  exp?: number;
}

function base64UrlEncode(str: string | Buffer): string {
  const buf = typeof str === "string" ? Buffer.from(str) : str;
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  return Buffer.from(base64, "base64").toString("utf-8");
}

export function createSessionToken(payload: Omit<SessionPayload, "iat" | "exp">): string {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: SessionPayload = {
    ...payload,
    iat: now,
    exp: now + 86400, // 24 hours
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));

  const signature = createHmac("sha256", JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();
  const encodedSignature = base64UrlEncode(signature);

  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    if (!token || typeof token !== "string") return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const expectedSignature = createHmac("sha256", JWT_SECRET)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest();
    
    const actualSignature = Buffer.from(encodedSignature.replace(/-/g, "+").replace(/_/g, "/"), "base64");

    if (actualSignature.length !== expectedSignature.length) {
      return null;
    }
    if (!timingSafeEqual(actualSignature, expectedSignature)) {
      return null;
    }

    const payload: SessionPayload = JSON.parse(base64UrlDecode(encodedPayload));
    const now = Math.floor(Date.now() / 1000);

    if (payload.exp && payload.exp < now) {
      return null; // Expired token
    }

    return payload;
  } catch {
    return null;
  }
}
