import { addDays, cycleStart, isIsoDate } from "./dates";
import { db, APP_TZ, type Exec } from "./db";
import { departmentLabel, formatLockPeriod } from "./department";

/** A month key covers that calendar month. A Wednesday key covers that day through the next Wednesday. */
export function periodCovers(lockKey: string, iso: string): boolean {
  if (/^\d{4}-\d{2}$/.test(lockKey)) return iso.slice(0, 7) === lockKey;
  if (!isIsoDate(lockKey)) return false;
  return iso >= lockKey && iso <= addDays(lockKey, 7);
}

/** Lock keys that could cover any of these dates (month, this cycle, and the previous cycle's closing Wednesday). */
export function lockKeysFor(dates: string[]): string[] {
  const keys = new Set<string>();
  for (const iso of dates) {
    keys.add(iso.slice(0, 7));
    const start = cycleStart(iso);
    keys.add(start);
    if (start === iso) keys.add(addDays(iso, -7));
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

export function dateIsLocked(department: string, iso: string, locks: { department: string; month: string }[]): boolean {
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
