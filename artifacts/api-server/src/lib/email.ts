import { logger } from "./logger";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || "Lina AI <onboarding@resend.dev>";

/**
 * Sends a signup verification code to the given address via Resend's HTTP
 * API. In development (no RESEND_API_KEY set, not production), the code is
 * logged to the console instead of sent, so signup can be tested without a
 * live email provider. In production, a missing key is a hard failure --
 * silently "succeeding" would leave the user stuck with a code they never
 * received.
 */
/**
 * Generic send via Resend's HTTP API. Same dev-mode behavior as the OTP
 * email below: with no RESEND_API_KEY set outside production, the email is
 * logged instead of sent so features that send mail can still be tested
 * locally.
 */
export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!RESEND_API_KEY) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Email delivery is not configured (RESEND_API_KEY missing).");
    }
    logger.warn({ to, subject }, "[dev] RESEND_API_KEY not set — email logged instead of sent");
    return;
  }

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, html }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    logger.error({ status: resp.status, body }, "Resend API error sending email");
    throw new Error("Failed to send email.");
  }
}

export async function sendOtpEmail(to: string, code: string): Promise<void> {
  await sendEmail(
    to,
    "Your Lina AI verification code",
    `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <h2 style="margin-bottom:8px">Verify your email</h2>
      <p style="color:#555">Enter this code to finish creating your Lina AI account:</p>
      <p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:24px 0">${code}</p>
      <p style="color:#888;font-size:13px">This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>
    </div>`,
  );
}

export async function sendStatusBriefingEmail(to: string, briefingText: string): Promise<void> {
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const bodyHtml = briefingText
    .split("\n")
    .filter(Boolean)
    .map((line) => `<p style="margin:0 0 12px;color:#333;line-height:1.5">${line.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`)
    .join("");
  await sendEmail(
    to,
    `Lina — Status briefing for ${today}`,
    `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <h2 style="margin-bottom:4px">Status briefing</h2>
      <p style="color:#888;font-size:13px;margin-top:0">${today}</p>
      ${bodyHtml}
    </div>`,
  );
}
