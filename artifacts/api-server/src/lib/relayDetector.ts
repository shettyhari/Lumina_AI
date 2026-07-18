import { eq } from "drizzle-orm";
import { db, familyMembers, familyMessages } from "@workspace/db";

// Patterns that trigger an AI relay to another family member
const RELAY_PATTERNS: RegExp[] = [
  /^(?:tell|message|text|msg|notify|ping|remind|alert)\s+([\w]+(?:\s+[\w]+)?)\b[,:]?\s+(?:that\s+|to\s+)?(.+)/is,
  /^let\s+([\w]+(?:\s+[\w]+)?)\s+know\s+(?:that\s+)?(.+)/is,
  /^send\s+([\w]+(?:\s+[\w]+)?)\s+(?:a\s+)?(?:message|note|msg|reminder|text)[,:]?\s*(.+)/is,
];

export interface RelayResult {
  targetDisplayName: string;
  confirmMsg: string;
}

/**
 * Detects relay patterns in a user message and delivers the note to the target family member.
 * Returns a RelayResult if a relay was successfully executed, null otherwise.
 */
export async function detectAndExecuteRelay(
  fromClerkUserId: string,
  userMessage: string,
): Promise<RelayResult | null> {
  let nameGuess: string | null = null;
  let content: string | null = null;

  const trimmed = userMessage.trim();
  for (const pattern of RELAY_PATTERNS) {
    const m = trimmed.match(pattern);
    if (m) {
      nameGuess = m[1].trim().toLowerCase();
      content = m[2].trim();
      break;
    }
  }

  if (!nameGuess || !content || content.length < 2) return null;

  // Find approved / admin family members (excluding sender)
  const members = await db.select().from(familyMembers);
  const target = members.find((m) => {
    if (m.clerkUserId === fromClerkUserId) return false;
    if (m.status !== "approved" && m.role !== "admin") return false;
    const dn = (m.displayName ?? "").toLowerCase();
    const firstName = dn.split(" ")[0];
    if (!firstName) return false;
    return (
      dn === nameGuess ||
      firstName === nameGuess ||
      dn.startsWith(nameGuess!) ||
      (nameGuess!.length >= 3 && firstName.startsWith(nameGuess!))
    );
  });

  if (!target) return null;

  await db.insert(familyMessages).values({
    fromClerkUserId,
    toClerkUserId: target.clerkUserId,
    content,
    isAiRelay: true,
  });

  const displayName = target.displayName || target.email?.split("@")[0] || nameGuess;
  return {
    targetDisplayName: displayName,
    confirmMsg: `Note delivered to ${displayName} ✓`,
  };
}
