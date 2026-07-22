import { rateLimit } from "express-rate-limit";

/**
 * Rate limiter for AI / image-generation routes.
 * Limits each user (by Clerk user ID if set, otherwise by IP) to prevent
 * runaway API cost from a compromised or abusive account.
 */
export const aiRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 30, // 30 requests per user per minute
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => (req as any).clerkUserId ?? req.ip ?? "unknown",
  message: { error: "rate_limit_exceeded", message: "Too many requests — please slow down." },
  skip: (req) => req.method === "OPTIONS",
});

/**
 * Stricter rate limiter for image generation (more expensive).
 */
export const imageGenRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 5, // 5 image generations per user per minute
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => (req as any).clerkUserId ?? req.ip ?? "unknown",
  message: { error: "rate_limit_exceeded", message: "Too many image generation requests — please slow down." },
  skip: (req) => req.method === "OPTIONS",
});
