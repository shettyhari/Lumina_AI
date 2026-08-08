import { logger } from "./logger";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || "Lumina AI <onboarding@resend.dev>";

/**
 * Sends a signup verification code to the given address via Resend's HTTP
 * API. In development (no RESEND_API_KEY set, not production), the code is
 * logged to the console instead of sent, so signup can be tested without a
 * live email provider. In production, a missing key is a hard failure --
 * silently "succeeding" would leave the user stuck with a code they never
 * received.
 */
export async function sendOtpEmail(to: string, code: string): Promise<void> {
  if (!RESEND_API_KEY) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Email delivery is not configured (RESEND_API_KEY missing).");
    }
    logger.warn({ to, code }, "[dev] RESEND_API_KEY not set — verification code logged instead of emailed");
    return;
  }

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [to],
      subject: "Your Lumina AI verification code",
      html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="margin-bottom:8px">Verify your email</h2>
        <p style="color:#555">Enter this code to finish creating your Lumina AI account:</p>
        <p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:24px 0">${code}</p>
        <p style="color:#888;font-size:13px">This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>
      </div>`,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    logger.error({ status: resp.status, body }, "Resend API error sending OTP email");
    throw new Error("Failed to send verification email.");
  }
}
