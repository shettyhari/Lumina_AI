import { rateLimit } from "express-rate-limit";

/**
 * Strict Rate Limiter for Authentication endpoints (/api/auth/login, /api/auth/register).
 * Protects against brute-force password guessing attacks (OWASP requirement).
 */
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10, // Max 10 authentication requests per IP per 15 minutes
  standardHeaders: "draft-8",
  legacyHeaders: false,
  validate: false,
  message: { error: "rate_limit_exceeded", message: "Too many failed login attempts. Please try again after 15 minutes." },
  skip: (req) => req.method === "OPTIONS",
});

/**
 * Rate limiter for AI / image-generation routes.
 */
export const aiRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 30, // 30 requests per user per minute
  standardHeaders: "draft-8",
  legacyHeaders: false,
  validate: false,
  keyGenerator: (req) => (req as any).clerkUserId ?? req.ip ?? "anonymous",
  message: { error: "rate_limit_exceeded", message: "Too many requests — please slow down." },
  skip: (req) => req.method === "OPTIONS",
});

/**
 * Stricter rate limiter for image generation.
 */
export const imageGenRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 5, // 5 image generations per user per minute
  standardHeaders: "draft-8",
  legacyHeaders: false,
  validate: false,
  keyGenerator: (req) => (req as any).clerkUserId ?? req.ip ?? "anonymous",
  message: { error: "rate_limit_exceeded", message: "Too many image generation requests — please slow down." },
  skip: (req) => req.method === "OPTIONS",
});
