import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, users, familyMembers } from "@workspace/db";
import { hashPassword, verifyPassword } from "../lib/authCrypto.js";
import { createSessionToken } from "../lib/sessionToken.js";
import { authRateLimit } from "../middlewares/rateLimiter.js";
import { requireAuth, getReqUserId } from "../middlewares/requireAuth.js";

const router: IRouter = Router();

// In-memory fallback user store for environments without active PostgreSQL connection
interface StoredUser {
  id: number;
  clerkUserId: string;
  email: string;
  passwordHash: string;
  displayName: string;
  role: string;
  createdAt: Date;
}

const memoryUserStore = new Map<string, StoredUser>();

// Helper to look up user by email from DB or memory fallback
async function findUserByEmail(email: string): Promise<StoredUser | null> {
  const normalizedEmail = email.trim().toLowerCase();
  
  try {
    const [dbUser] = await db.select().from(users).where(eq(users.email, normalizedEmail));
    if (dbUser) {
      let role = "member";
      try {
        const [member] = await db.select().from(familyMembers).where(eq(familyMembers.clerkUserId, dbUser.clerkUserId));
        if (member?.role) role = member.role;
      } catch { /* ignore */ }
      return {
        id: dbUser.id,
        clerkUserId: dbUser.clerkUserId || `user_${dbUser.id}`,
        email: normalizedEmail,
        passwordHash: dbUser.passwordHash || "",
        displayName: dbUser.displayName || normalizedEmail.split("@")[0],
        role,
        createdAt: dbUser.createdAt,
      };
    }
  } catch (err) {
    console.error("findUserByEmail database error, falling back to memory:", err);
  }

  return memoryUserStore.get(normalizedEmail) || null;
}

/** Thrown when a registration attempt targets an email that is already registered. */
class DuplicateEmailError extends Error {
  constructor() {
    super("An account with this email already exists.");
    this.name = "DuplicateEmailError";
  }
}

// Helper to create a new user in DB or memory fallback.
// Rejects registration if the email is already taken — never overwrites an
// existing account's credentials (that would allow account takeover).
async function createUser(email: string, passwordHash: string, displayName?: string): Promise<StoredUser> {
  const normalizedEmail = email.trim().toLowerCase();
  const clerkUserId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const finalName = displayName?.trim() || normalizedEmail.split("@")[0];

  let isFirstUser = memoryUserStore.size === 0;
  let newUser: StoredUser;

  try {
    try {
      const existingMembers = await db.select().from(familyMembers);
      isFirstUser = existingMembers.length === 0;
    } catch { /* ignore */ }

    const [existingDbUser] = await db.select().from(users).where(eq(users.email, normalizedEmail));

    if (existingDbUser) {
      throw new DuplicateEmailError();
    } else {
      const [dbUser] = await db.insert(users).values({
        clerkUserId,
        email: normalizedEmail,
        passwordHash,
        displayName: finalName,
      }).returning();

      const role = isFirstUser ? "admin" : "member";
      try {
        await db.insert(familyMembers).values({
          clerkUserId,
          role,
          status: isFirstUser ? "approved" : "pending",
          displayName: finalName,
          email: normalizedEmail,
        });
      } catch { /* ignore */ }

      newUser = {
        id: dbUser.id,
        clerkUserId,
        email: normalizedEmail,
        passwordHash,
        displayName: finalName,
        role,
        createdAt: dbUser.createdAt,
      };
    }
  } catch (err) {
    if (err instanceof DuplicateEmailError) {
      throw err;
    }

    console.error("createUser database error, falling back to memory store:", err);

    if (memoryUserStore.has(normalizedEmail)) {
      throw new DuplicateEmailError();
    }

    // Memory store fallback
    const role = isFirstUser ? "admin" : "member";
    newUser = {
      id: memoryUserStore.size + 1,
      clerkUserId,
      email: normalizedEmail,
      passwordHash,
      displayName: finalName,
      role,
      createdAt: new Date(),
    };
  }

  memoryUserStore.set(normalizedEmail, newUser);
  return newUser;
}

/**
 * POST /api/auth/register
 * Validates registration data, creates a new account (rejecting duplicate
 * emails), hashes the password with scrypt, and returns 200 + token.
 */
router.post("/auth/register", authRateLimit, async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, displayName } = req.body ?? {};

    if (!email || typeof email !== "string" || !email.includes("@")) {
      res.status(400).json({ error: "Please enter a valid email address." });
      return;
    }

    if (!password || typeof password !== "string" || password.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters long." });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const passwordHash = hashPassword(password);

    let user: StoredUser;
    try {
      user = await createUser(normalizedEmail, passwordHash, displayName);
    } catch (err) {
      if (err instanceof DuplicateEmailError) {
        res.status(409).json({ error: err.message });
        return;
      }
      throw err;
    }

    const token = createSessionToken({
      userId: user.clerkUserId,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    });

    try {
      res.cookie("lumina_session_token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 86400 * 1000,
      });
    } catch { /* ignore cookie set error if headers sent */ }

    res.status(200).json({
      token,
      user: {
        id: user.clerkUserId,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
    });
  } catch (err: any) {
    console.error("Registration endpoint error:", err);
    if (req.log?.error) req.log.error({ err }, "Registration error");
    if (!res.headersSent) {
      res.status(500).json({ error: "Registration failed. Please try again." });
    }
  }
});

/**
 * POST /api/auth/login
 * Validates login credentials against server database.
 * Requirement 3: If email does not exist → "Invalid email address."
 * Requirement 4: If password incorrect → "Incorrect password."
 */
router.post("/auth/login", authRateLimit, async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body ?? {};

    if (!email || typeof email !== "string" || !email.trim()) {
      res.status(400).json({ error: "Please enter your email address." });
      return;
    }

    if (!password || typeof password !== "string" || !password.trim()) {
      res.status(400).json({ error: "Please enter your password." });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await findUserByEmail(normalizedEmail);

    if (!user) {
      res.status(401).json({ error: "Invalid email address." });
      return;
    }

    if (!user.passwordHash) {
      res.status(401).json({ error: "Incorrect password." });
      return;
    }

    const isPasswordValid = verifyPassword(password, user.passwordHash);
    if (!isPasswordValid) {
      res.status(401).json({ error: "Incorrect password." });
      return;
    }

    const token = createSessionToken({
      userId: user.clerkUserId,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    });

    try {
      res.cookie("lumina_session_token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 86400 * 1000,
      });
    } catch { /* ignore */ }

    res.status(200).json({
      token,
      user: {
        id: user.clerkUserId,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
    });
  } catch (err: any) {
    console.error("Login endpoint error:", err);
    if (req.log?.error) req.log.error({ err }, "Login error");
    if (!res.headersSent) {
      res.status(500).json({ error: "Authentication failed. Please try again." });
    }
  }
});

/**
 * POST /api/auth/logout
 * Destroys session token & clears HttpOnly cookie.
 */
router.post("/auth/logout", (req: Request, res: Response): void => {
  try {
    res.clearCookie("lumina_session_token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    });
  } catch { /* ignore */ }
  res.status(200).json({ message: "Logged out successfully" });
});

/**
 * GET /api/auth/me
 * Returns profile of currently authenticated user.
 */
router.get("/auth/me", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = getReqUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const session = (req as any).userSession;
  res.status(200).json({
    user: {
      id: userId,
      email: session?.email ?? "user@lumina.ai",
      displayName: session?.displayName ?? "Lumina User",
      role: session?.role ?? "admin",
    },
  });
});

export default router;
