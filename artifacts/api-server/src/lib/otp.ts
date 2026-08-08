import { randomInt } from "node:crypto";

/** Generates a 6-digit numeric OTP code, zero-padded (e.g. "042917"). */
export function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}
