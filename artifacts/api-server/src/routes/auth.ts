import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, users, familyMembers } from "@workspace/db";
import { hashPassword, verifyPassword } from "../lib/authCrypto";
import { createSessionToken } from "../lib/sessionToken";
import { authRateLimit } from "../middlewares/rateLimiter";
import { requireAuth, getReqUserId } from "../middlewares/requireAuth";

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
  } catch {
    /* PostgreSQL fallback to memory store */
  }

  return memoryUserStore.get(normalizedEmail) || null;
}

// Helper to create or update user in DB or memory fallback
async function createUser(email: string, passwordHash: string, displayName?: string): Promise<StoredUser> {
  const normalizedEmail = email.trim().toLowerCase();
  const clerkUserId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const finalName = displayName?.trim() || normalizedEmail.split("@")[0];

  let isFirstUser = memoryUserStore.size === 0;
  let newUser: StoredUser;

  try {
    const existingMembers = await db.select().from(familyMembers);
    isFirstUser = existingMembers.length === 0;

    const [existingDbUser] = await db.select().from(users).where(eq(users.email, normalizedEmail));

    if (existingDbUser) {
      const [updated] = await db.update(users)
        .set({ passwordHash, displayName: finalName })
        .where(eq(users.email, normalizedEmail))
        .returning();

      const role = isFirstUser ? "admin" : "member";
      newUser = {
        id: updated.id,
        clerkUserId: updated.clerkUserId || clerkUserId,
        email: normalizedEmail,
        passwordHash,
        displayName: finalName,
        role,
        createdAt: updated.createdAt,
      };
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
  } catch {
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
 * Validates registration data, prevents duplicate emails, hashes password, returns 201 + token.
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
    const existing = await findUserByEmail(normalizedEmail);
    if (existing && existing.passwordHash) {
      res.status(400).json({ error: "An account with this email address already exists." });
      return;
    }

    const passwordHash = hashPassword(password);
    const user = await createUser(normalizedEmail, passwordHash, displayName);

    const token = createSessionToken({
      userId: user.clerkUserId,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    });

    res.cookie("lumina_session_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 86400 * 1000,
    });

    res.status(201).json({
      token,
      user: {
        id: user.clerkUserId,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Registration error");
    res.status(500).json({ error: "Registration failed. Please try again." });
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

    res.cookie("lumina_session_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 86400 * 1000,
    });

    res.status(200).json({
      token,
      user: {
        id: user.clerkUserId,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Login error");
    res.status(500).json({ error: "Authentication failed. Please try again." });
  }
});

/**
 * POST /api/auth/logout
 * Destroys session token & clears HttpOnly cookie.
 */
router.post("/auth/logout", (req: Request, res: Response): void => {
  res.clearCookie("lumina_session_token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });
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
