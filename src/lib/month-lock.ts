import { addDays, isIsoDate, mondayOf } from "./dates";
import { db, APP_TZ, type Exec } from "./db";
import { departmentLabel, formatLockPeriod } from "./department";

/**
 * A month key covers that calendar month. A date key covers the Monday–Sunday week it falls in
 * (new locks are stored by Monday; older ones by Wednesday).
 */
export function periodCovers(lockKey: string, iso: string): boolean {
  if (/^\d{4}-\d{2}$/.test(lockKey)) return iso.slice(0, 7) === lockKey;
  if (!isIsoDate(lockKey)) return false;
  return mondayOf(lockKey) === mondayOf(iso);
}

/** Lock keys that could cover any of these dates: the month, and the week's Monday (or an older Wednesday key). */
export function lockKeysFor(dates: string[]): string[] {
  const keys = new Set<string>();
  for (const iso of dates) {
    keys.add(iso.slice(0, 7));
    const monday = mondayOf(iso);
    keys.add(monday);
    keys.add(addDays(monday, 2));
  }
  return [...keys];
}

/** Why this employee's date cannot be edited, or null when it is open. */
export async function monthLockMessage(e: Exec, employeeId: number, isoDate: string): Promise<string | null> {
  const keys = lockKeysFor([isoDate]);
  const row = await e.one<{ department: string }>(
    `SELECT btrim(COALESCE(department, '')) AS department FROM employees WHERE id = $1`,
    [employeeId],
  );
  if (!row) return null;
  const locks = await e.q<{ month: string }>(
    `SELECT month FROM month_locks WHERE department = $1 AND month = ANY($2::text[])`,
    [row.department, keys],
  );
  const hit = locks.find((l) => periodCovers(l.month, isoDate));
  if (!hit) return null;
  const approved = await e.one(
    `SELECT 1 FROM edit_requests
     WHERE department = $1 AND status = 'APPROVED' AND closed_at IS NULL AND $2::date = ANY(dates)
       AND (employee_id IS NULL OR employee_id = $3)`,
    [row.department, isoDate, employeeId],
  );
  if (approved) return null;
  return `${departmentLabel(row.department)} is locked for ${formatLockPeriod(hit.month)}. An admin must allow editing before it can be changed.`;
}

export async function locksForDates(dates: string[]): Promise<{ department: string; month: string }[]> {
  const keys = lockKeysFor(dates);
  if (keys.length === 0) return [];
  return (await db()).q<{ department: string; month: string }>(
    "SELECT department, month FROM month_locks WHERE month = ANY($1::text[])",
    [keys],
  );
}

/**
 * Locked dates the admin has opened through an approved edit request.
 * Keys: "department|date" for a whole-department request, "department|date|employeeId" for one employee.
 */
export async function approvedEditDates(dates: string[]): Promise<Set<string>> {
  if (dates.length === 0) return new Set();
  const rows = await (await db()).q<{ department: string; date: string; employee_id: number | null }>(
    `SELECT DISTINCT department, d::text AS date, employee_id
     FROM edit_requests, unnest(dates) AS d
     WHERE status = 'APPROVED' AND closed_at IS NULL AND d = ANY($1::date[])`,
    [dates],
  );
  return new Set(rows.map((r) => `${r.department}|${r.date}${r.employee_id ? `|${r.employee_id}` : ""}`));
}

/** True when the date is open for this employee (department-wide or just for them). */
export function isOpenedFor(opened: Set<string>, department: string, iso: string, employeeId: number): boolean {
  return opened.has(`${department}|${iso}`) || opened.has(`${department}|${iso}|${employeeId}`);
}

export function dateIsLocked(
  department: string,
  iso: string,
  locks: { department: string; month: string }[],
  opened?: Set<string>,
): boolean {
  if (opened?.has(`${department}|${iso}`)) return false;
  return locks.some((l) => l.department === department && periodCovers(l.month, iso));
}

export async function lockedDepartmentKeys(month: string): Promise<Set<string>> {
  const rows = await (await db()).q<{ department: string }>("SELECT department FROM month_locks WHERE month = $1", [month]);
  return new Set(rows.map((r) => r.department));
}

export type MonthLockRow = {
  department: string;
  month: string;
  locked_by_name: string | null;
  locked_at: string;
};

export async function listMonthLocks(): Promise<MonthLockRow[]> {
  return (await db()).q<MonthLockRow>(
    `SELECT l.department, l.month, e.name AS locked_by_name,
            to_char(l.locked_at AT TIME ZONE $1, 'DD-Mon-YYYY HH24:MI') AS locked_at
     FROM month_locks l
     LEFT JOIN employees e ON e.id = l.locked_by
     ORDER BY l.month DESC, l.department`,
    [APP_TZ],
  );
}

export type EditRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export type EditRequestRow = {
  id: number;
  department: string;
  month: string;
  note: string;
  dates: string[];
  employee_id: number | null;
  employee_name: string | null;
  employee_code: string | null;
  status: EditRequestStatus;
  /** Set when the head has finished and the opened dates are locked again. */
  closed_at: string | null;
  admin_note: string | null;
  requested_by_name: string | null;
  decided_by_name: string | null;
  created_at: string;
  decided_at: string | null;
};

const REQUEST_SELECT = `
  SELECT r.id, r.department, r.month, r.note, r.dates::text[] AS dates, r.status, r.admin_note,
         r.employee_id, te.name AS employee_name, te.emp_code AS employee_code,
         to_char(r.closed_at AT TIME ZONE $1, 'DD-Mon-YYYY HH24:MI') AS closed_at,
         rb.name AS requested_by_name, db.name AS decided_by_name,
         to_char(r.created_at AT TIME ZONE $1, 'DD-Mon-YYYY HH24:MI') AS created_at,
         to_char(r.decided_at AT TIME ZONE $1, 'DD-Mon-YYYY HH24:MI') AS decided_at
  FROM edit_requests r
  LEFT JOIN employees rb ON rb.id = r.requested_by
  LEFT JOIN employees db ON db.id = r.decided_by
  LEFT JOIN employees te ON te.id = r.employee_id`;

/** Pending requests first, then the most recent decisions. */
export async function listEditRequests(limit = 50): Promise<EditRequestRow[]> {
  return (await db()).q<EditRequestRow>(
    `${REQUEST_SELECT}
     ORDER BY (r.status = 'PENDING') DESC, COALESCE(r.decided_at, r.created_at) DESC
     LIMIT $2`,
    [APP_TZ, limit],
  );
}

export async function pendingEditRequestCount(): Promise<number> {
  const row = await (await db()).one<{ c: number }>("SELECT COUNT(*)::int AS c FROM edit_requests WHERE status = 'PENDING'");
  return row?.c ?? 0;
}

/** A head's requests that still matter: pending, open (approved, not locked again), or decided in the last week. */
export async function activeEditRequests(departments: string[]): Promise<EditRequestRow[]> {
  if (departments.length === 0) return [];
  return (await db()).q<EditRequestRow>(
    `${REQUEST_SELECT}
     WHERE r.department = ANY($2::text[])
       AND (r.status = 'PENDING'
            OR (r.status = 'APPROVED' AND r.closed_at IS NULL)
            OR r.decided_at > now() - interval '7 days')
     ORDER BY r.id DESC
     LIMIT 30`,
    [APP_TZ, departments],
  );
}

/** Id of the approved, still-open edit request that opens this employee's date, or null. */
export async function openEditRequestFor(e: Exec, employeeId: number, isoDate: string): Promise<number | null> {
  const row = await e.one<{ id: number }>(
    `SELECT r.id FROM edit_requests r
     JOIN employees emp ON emp.id = $1 AND btrim(COALESCE(emp.department, '')) = r.department
     WHERE r.status = 'APPROVED' AND r.closed_at IS NULL AND $2::date = ANY(r.dates)
       AND (r.employee_id IS NULL OR r.employee_id = $1)
     ORDER BY r.id DESC LIMIT 1`,
    [employeeId, isoDate],
  );
  return row?.id ?? null;
}

export type PendingSummary = { count: number; latestId: number | null; latest: string | null };

/** For the admin notification: how many requests wait, and who sent the newest one. */
export async function pendingEditSummary(): Promise<PendingSummary> {
  const rows = await (await db()).q<{ id: number; department: string; name: string | null; c: number }>(
    `SELECT r.id, r.department, e.name, COUNT(*) OVER ()::int AS c
     FROM edit_requests r LEFT JOIN employees e ON e.id = r.requested_by
     WHERE r.status = 'PENDING'
     ORDER BY r.id DESC LIMIT 1`,
  );
  const r = rows[0];
  if (!r) return { count: 0, latestId: null, latest: null };
  return { count: r.c, latestId: r.id, latest: `${r.name ?? "A department head"} (${departmentLabel(r.department)})` };
}
