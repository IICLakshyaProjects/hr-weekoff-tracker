import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { randomBytes } from "node:crypto";
import { db } from "./db";
import type { Role, SessionUser } from "./types";

export const SESSION_COOKIE = "hrw_session";
const SESSION_TTL_HOURS = 12;

export async function createSession(employeeId: number) {
  const token = randomBytes(32).toString("hex");
  const e = await db();
  await e.run("DELETE FROM sessions WHERE expires_at < now()");
  const row = await e.one<{ expires_at: Date }>(
    `INSERT INTO sessions (token, employee_id, expires_at) VALUES ($1, $2, now() + make_interval(hours => $3))
     RETURNING expires_at`,
    [token, employeeId, SESSION_TTL_HOURS],
  );
  return { token, expiresAt: row!.expires_at };
}

export async function destroySession(token: string) {
  await (await db()).run("DELETE FROM sessions WHERE token = $1", [token]);
}

/** Reads the session cookie and returns the logged-in user, or null. Deduped per request. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = await (await db()).one<{
    id: number;
    emp_code: string;
    name: string;
    email: string;
    role: Role;
    can_edit_weekoff: boolean;
    portal_access: boolean;
    status: string;
  }>(
    `SELECT e.id, e.emp_code, e.name, e.email, e.role, e.can_edit_weekoff, e.portal_access, e.status
     FROM sessions s JOIN employees e ON e.id = s.employee_id
     WHERE s.token = $1 AND s.expires_at > now()`,
    [token],
  );
  // Access can be revoked at any time by an admin; enforce it on every request.
  if (!row || !row.portal_access || row.status !== "ACTIVE") return null;
  return {
    id: row.id,
    emp_code: row.emp_code,
    name: row.name,
    email: row.email,
    role: row.role,
    can_edit_weekoff: row.role === "ADMIN" || row.can_edit_weekoff,
  };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/weekoffs");
  return user;
}

/**
 * IDs of the employees this user may see.
 * - Admin: everyone (returns null = no restriction)
 * - Department head: every employee mapped under them (directly or through sub-heads)
 * - Employee: only themselves
 */
export const visibleEmployeeIds = cache(async (user: SessionUser): Promise<number[] | null> => {
  if (user.role === "ADMIN") return null;
  if (user.role === "EMPLOYEE") return [user.id];
  const rows = await (await db()).q<{ id: number }>(
    `WITH RECURSIVE team(id) AS (
       SELECT id FROM employees WHERE manager_id = $1
       UNION
       SELECT e.id FROM employees e JOIN team t ON e.manager_id = t.id
     )
     SELECT id FROM team`,
    [user.id],
  );
  return rows.map((r) => r.id);
});

export async function canView(user: SessionUser, employeeId: number): Promise<boolean> {
  const ids = await visibleEmployeeIds(user);
  return ids === null || ids.includes(employeeId);
}

export async function canEditWeekoff(user: SessionUser, employeeId: number): Promise<boolean> {
  if (user.role === "ADMIN") return true;
  // Heads (and permitted employees) can update their own week off as well as their team's.
  return user.can_edit_weekoff && (employeeId === user.id || (await canView(user, employeeId)));
}
