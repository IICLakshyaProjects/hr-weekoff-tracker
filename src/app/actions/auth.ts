"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { applyHeadDefaults, db, logActivity } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { createSession, destroySession, getCurrentUser, requireUser, SESSION_COOKIE } from "@/lib/auth";
import type { ActionResult } from "@/lib/types";

type LoginRow = { id: number; emp_code: string; role: string; password_hash: string | null; portal_access: boolean; status: string };

async function findByEmail(email: string): Promise<LoginRow | undefined> {
  // Emails are unique (case-insensitive).
  return (await db()).one<LoginRow>(
    "SELECT id, emp_code, role, password_hash, portal_access, status FROM employees WHERE lower(email) = lower($1)",
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
  const user = await requireUser();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (next.length < 8) return { ok: false, message: "New password must be at least 8 characters." };
  if (next !== confirm) return { ok: false, message: "New passwords do not match." };

  const e = await db();
  const row = await e.one<{ password_hash: string | null }>("SELECT password_hash FROM employees WHERE id = $1", [user.id]);
  if (!verifyPassword(current, row?.password_hash ?? null)) return { ok: false, message: "Current password is incorrect." };

  await e.run("UPDATE employees SET password_hash = $1, updated_at = now() WHERE id = $2", [hashPassword(next), user.id]);
  await logActivity(user.id, "PASSWORD_CHANGED", undefined, e);
  return { ok: true, message: "Password updated." };
}
