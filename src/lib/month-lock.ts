import { db, APP_TZ, type Exec } from "./db";
import { departmentLabel, formatMonth } from "./department";

/** Why this employee's month cannot be edited, or null when it is open. */
export async function monthLockMessage(e: Exec, employeeId: number, isoDate: string): Promise<string | null> {
  const month = isoDate.slice(0, 7);
  const row = await e.one<{ department: string; locked: boolean }>(
    `SELECT btrim(COALESCE(department, '')) AS department,
            EXISTS (
              SELECT 1 FROM month_locks l
              WHERE l.month = $2
                AND l.department = btrim(COALESCE(employees.department, ''))
            ) AS locked
     FROM employees WHERE id = $1`,
    [employeeId, month],
  );
  if (!row?.locked) return null;
  return `${departmentLabel(row.department)} is locked for ${formatMonth(month)}. An admin must allow editing before this month can be changed.`;
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
