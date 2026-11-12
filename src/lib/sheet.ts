import { APP_TZ, db, type Exec } from "./db";
import { toCsv } from "./csv";

export const SHEET_HEADER = ["Emp ID", "Associate Name", "Designation", "Date of Request", "Week off Date - 1", "Week off Date - 2"];
export const MAX_WEEKOFFS_PER_WEEK = 2;

export type SheetRow = {
  empId: string;
  name: string;
  designation: string;
  businessUnit: string;
  requestDate: string;
  wo1: string;
  wo2: string;
  weekStart: string;
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-15" → "Sunday, 15-Nov-2026" */
export function formatDayDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return `${DAY_NAMES[d.getUTCDay()]}, ${String(d.getUTCDate()).padStart(2, "0")}-${MON[d.getUTCMonth()]}-${d.getUTCFullYear()}`;
}

/** "2026-11-15" → "15-Nov-2026" */
function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}-${MON[Number(m) - 1]}-${y}`;
}

/** Monday (ISO date) of the week containing `iso`. Weeks run Monday–Sunday. */
export function weekStart(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export function weekEnd(iso: string): string {
  const d = new Date(weekStart(iso) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
}

/** Number of week offs the employee already has in the Mon–Sun week containing `date`. */
export async function weekoffsInWeek(e: Exec, employeeId: number, date: string): Promise<number> {
  const row = await e.one<{ c: number }>(
    "SELECT COUNT(*)::int AS c FROM weekoffs WHERE employee_id = $1 AND date BETWEEN $2 AND $3",
    [employeeId, weekStart(date), weekEnd(date)],
  );
  return row?.c ?? 0;
}

/**
 * One row per employee per week that has a week off.
 * - Two week offs in the week → both dates.
 * - One week off → Date-1 = "Working", Date-2 = the selected day.
 * Date of Request = when the latest week off of that week was marked.
 */
export async function buildSheetRows(
  opts: { employeeIds?: number[] | null; businessUnit?: string; from?: string; to?: string } = {},
): Promise<SheetRow[]> {
  const where: string[] = [];
  const params: unknown[] = [APP_TZ];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  if (opts.employeeIds) {
    if (opts.employeeIds.length === 0) return [];
    where.push(`w.employee_id = ANY(${p(opts.employeeIds)}::int[])`);
  }
  if (opts.businessUnit !== undefined) where.push(`e.business_unit = ${p(opts.businessUnit)}`);
  // Widen to whole weeks so a week spanning two months is never split.
  if (opts.from) where.push(`w.date >= ${p(weekStart(opts.from))}`);
  if (opts.to) where.push(`w.date <= ${p(weekEnd(opts.to))}`);

  const rows = await (await db()).q<{
    id: number;
    emp_code: string;
    name: string;
    designation: string | null;
    business_unit: string | null;
    date: string;
    requested: string;
  }>(
    `SELECT e.id, e.emp_code, e.name, e.designation, e.business_unit, w.date,
            to_char(w.marked_at AT TIME ZONE $1, 'YYYY-MM-DD') AS requested
     FROM weekoffs w JOIN employees e ON e.id = w.employee_id
     ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY w.date, e.emp_code`,
    params,
  );

  const groups = new Map<string, { r: (typeof rows)[number]; dates: string[]; requested: string; week: string }>();
  for (const r of rows) {
    const week = weekStart(r.date);
    const key = `${r.id}|${week}`;
    const g = groups.get(key);
    if (g) {
      g.dates.push(r.date);
      if (r.requested > g.requested) g.requested = r.requested;
    } else groups.set(key, { r, dates: [r.date], requested: r.requested, week });
  }

  return [...groups.values()]
    .map(({ r, dates, requested, week }) => {
      const sorted = dates.sort();
      return {
        empId: r.emp_code,
        name: r.name,
        designation: r.designation ?? "",
        businessUnit: r.business_unit ?? "",
        requestDate: formatDate(requested),
        wo1: sorted.length >= 2 ? formatDayDate(sorted[0]) : "Working",
        wo2: formatDayDate(sorted.length >= 2 ? sorted[1] : sorted[0]),
        weekStart: week,
      };
    })
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart) || a.empId.localeCompare(b.empId));
}

export function sheetValues(rows: SheetRow[]): string[][] {
  return [SHEET_HEADER, ...rows.map((r) => [r.empId, r.name, r.designation, r.requestDate, r.wo1, r.wo2])];
}

export function sheetCsv(rows: SheetRow[]): string {
  return "﻿" + toCsv(sheetValues(rows));
}
