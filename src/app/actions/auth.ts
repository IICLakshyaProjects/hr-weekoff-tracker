"use server";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { applyHeadDefaults, db, logActivity } from "@/lib/db";
import { hashPassword, headDefaultPassword, newPasswordError, verifyPassword } from "@/lib/password";
import { createSession, destroySession, getCurrentUser, SESSION_COOKIE } from "@/lib/auth";
import type { ActionResult } from "@/lib/types";

type LoginRow = {
  id: number;
  emp_code: string;
  role: string;
  password_hash: string | null;
  must_change_password: boolean;
  portal_access: boolean;
  status: string;
};

async function findByEmail(email: string): Promise<LoginRow | undefined> {
  // Emails are unique (case-insensitive).
  return (await db()).one<LoginRow>(
    "SELECT id, emp_code, role, password_hash, must_change_password, portal_access, status FROM employees WHERE lower(email) = lower($1)",
    [email],
  );
}

/** Employee / Department Head login: Employee ID + Email ID + password. */
export async function login(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const empCode = String(formData.get("emp_code") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!empCode || !email || !password) {
    return { ok: false, message: "Employee ID, email and password are all required." };
  }
  // Make sure every Department Head has login access (covers heads added before this rule existed).
  await applyHeadDefaults();
  const row = await findByEmail(email);
  if (!row || row.emp_code.toLowerCase() !== empCode.toLowerCase() || !verifyPassword(password, row.password_hash)) {
    return { ok: false, message: "Invalid Employee ID, email or password." };
  }
  if (row.role === "HEAD" && password === headDefaultPassword()) {
    await (await db()).run("UPDATE employees SET must_change_password = TRUE WHERE id = $1", [row.id]);
    row.must_change_password = true;
  }
  return startSession(row);
}

/** Admin login (separate page at /admin): Email ID + password, admins only. */
export async function adminLogin(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { ok: false, message: "Email and password are required." };
  const row = await findByEmail(email);
  if (!row || row.role !== "ADMIN" || !verifyPassword(password, row.password_hash)) {
    return { ok: false, message: "Invalid admin email or password." };
  }
  return startSession(row);
}

async function startSession(row: LoginRow): Promise<ActionResult> {
  if (!row.portal_access || row.status !== "ACTIVE") {
    return { ok: false, message: "You do not have portal access. Please contact HR / Admin." };
  }

  const { token, expiresAt } = await createSession(row.id);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  await logActivity(row.id, "LOGIN");
  if (row.must_change_password) redirect("/password");
  redirect(row.role === "ADMIN" ? "/employees" : "/weekoffs");
}

export async function logout() {
  const user = await getCurrentUser();
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await destroySession(token);
  store.delete(SESSION_COOKIE);
  redirect(user?.role === "ADMIN" ? "/admin" : "/login");
}

export async function changePassword(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Your session expired. Sign in again, then change your password." };
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const problem = newPasswordError(next, confirm, user.role);
  if (problem) return { ok: false, message: problem };

  const e = await db();
  const row = await e.one<{ password_hash: string | null }>("SELECT password_hash FROM employees WHERE id = $1", [user.id]);
  if (!verifyPassword(current, row?.password_hash ?? null)) return { ok: false, message: "Current password is incorrect." };

  await e.run(
    "UPDATE employees SET password_hash = $1, must_change_password = FALSE, updated_at = now() WHERE id = $2",
    [hashPassword(next), user.id],
  );
  await logActivity(user.id, "PASSWORD_CHANGED", undefined, e);
  return { ok: true, message: "Password updated. Use it the next time you sign in." };
}

/** First login with the shared head password. A new password is required before the rest of the portal opens. */
export async function setRequiredPassword(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Your session expired. Sign in again." };
  if (!user.must_change_password) redirect(user.role === "ADMIN" ? "/employees" : "/weekoffs");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const problem = newPasswordError(next, confirm, user.role);
  if (problem) return { ok: false, message: problem };

  const e = await db();
  await e.run(
    "UPDATE employees SET password_hash = $1, must_change_password = FALSE, updated_at = now() WHERE id = $2",
    [hashPassword(next), user.id],
  );
  await logActivity(user.id, "PASSWORD_CHANGED", "required reset", e);
  redirect(user.role === "ADMIN" ? "/employees" : "/weekoffs");
}

/** Employee ID + email is enough to start a reset. There is no mail server, so the next step opens immediately. */
export async function requestPasswordReset(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const empCode = String(formData.get("emp_code") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  if (!empCode || !email) return { ok: false, message: "Employee ID and email are required." };

  const row = await findByEmail(email);
  if (!row || row.emp_code.toLowerCase() !== empCode.toLowerCase() || !row.portal_access || row.status !== "ACTIVE") {
    return { ok: false, message: "Employee ID and email do not match an active account." };
  }

  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const e = await db();
  await e.run("DELETE FROM password_resets WHERE employee_id = $1", [row.id]);
  await e.run(
    "INSERT INTO password_resets (token_hash, employee_id, expires_at) VALUES ($1, $2, now() + interval '30 minutes')",
    [tokenHash, row.id],
  );
  await logActivity(row.id, "PASSWORD_RESET_REQUESTED");
  redirect(`/login/reset?token=${token}`);
}

export async function completePasswordReset(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const token = String(formData.get("token") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!token) return { ok: false, message: "This reset link is missing. Request a new one." };

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const e = await db();
  const row = await e.one<{ employee_id: number; role: string }>(
    `SELECT r.employee_id, emp.role
     FROM password_resets r JOIN employees emp ON emp.id = r.employee_id
     WHERE r.token_hash = $1 AND r.expires_at > now()`,
    [tokenHash],
  );
  if (!row) return { ok: false, message: "This reset link has expired. Request a new one from the sign-in page." };
  const problem = newPasswordError(next, confirm, row.role);
  if (problem) return { ok: false, message: problem };

  await e.run(
    "UPDATE employees SET password_hash = $1, must_change_password = FALSE, updated_at = now() WHERE id = $2",
    [hashPassword(next), row.employee_id],
  );
  await e.run("DELETE FROM password_resets WHERE employee_id = $1", [row.employee_id]);
  await logActivity(row.employee_id, "PASSWORD_RESET");
  redirect("/login?reset=1");
}
