import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function headDefaultPassword(): string {
  return process.env.HEAD_DEFAULT_PASSWORD ?? "Admin@123";
}

/** Shared rules for choosing a replacement password. Heads cannot keep the shared default. */
export function newPasswordError(next: string, confirm: string, role?: string): string | null {
  if (next.length < 8) return "New password must be at least 8 characters.";
  if (next !== confirm) return "New passwords do not match.";
  if (role === "HEAD" && next === headDefaultPassword()) {
    return "Choose your own password. The shared department-head password cannot be kept.";
  }
  return null;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
