import { APP_TZ, db, type Exec } from "./db";
import { toCsv } from "./csv";

export const SHEET_HEADER = ["Emp ID", "Associate Name", "Designation", "Date of Request", "Week off Date - 1", "Week off Date - 2"];
export const MAX_WEEKOFFS_PER_WEEK = 2;

export type SheetRow = {
  empId: string;
  name: string;
  designation: string;
  businessUnit: string;
  department: string;
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
export const SHEET_PAGE_SIZE = 25;

export type SheetQuery = {
  employeeIds?: number[] | null;
  businessUnit?: string;
  department?: string;
  from?: string;
  to?: string;
};

type GroupedMark = {
  emp_code: string;
  name: string;
  designation: string | null;
  business_unit: string | null;
  department: string | null;
  week_start: string;
  requested: string;
  dates: unknown;
};

/** One grouped row (employee + week) from the SQL result. */
function toSheetRow(r: GroupedMark): SheetRow {
  const dates = (Array.isArray(r.dates) ? r.dates : String(r.dates).replace(/^\{|\}$/g, "").split(","))
    .map((d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).trim()))
    .filter(Boolean)
    .sort();
  const first = dates[0] ?? "";
  return {
    empId: r.emp_code,
    name: r.name,
    designation: r.designation ?? "",
    businessUnit: r.business_unit ?? "",
    department: r.department ?? "",
    requestDate: formatDate(r.requested),
    wo1: dates.length >= 2 ? formatDayDate(first) : "Working",
    wo2: first ? formatDayDate(dates.length >= 2 ? dates[1] : first) : "",
    weekStart: String(r.week_start).slice(0, 10),
  };
}

/**
 * CTE of one row per employee per week. Weeks are Monday–Sunday, widened so a week
 * that crosses a month boundary is not split. $1 is always the app timezone.
 */
function groupedSheetCte(opts: SheetQuery): { cte: string; params: unknown[] } | null {
  const params: unknown[] = [APP_TZ];
  const where: string[] = [];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  if (opts.employeeIds) {
    if (opts.employeeIds.length === 0) return null;
    where.push(`w.employee_id = ANY(${p(opts.employeeIds)}::int[])`);
  }
  if (opts.businessUnit !== undefined) where.push(`lower(trim(e.business_unit)) = lower(trim(${p(opts.businessUnit)}))`);
  if (opts.department) where.push(`lower(trim(e.department)) = lower(trim(${p(opts.department)}))`);
  if (opts.from) where.push(`w.date >= ${p(weekStart(opts.from))}`);
  if (opts.to) where.push(`w.date <= ${p(weekEnd(opts.to))}`);

  const cte = `
    filtered AS (
      SELECT e.id, e.emp_code, e.name, e.designation, e.business_unit, e.department,
             w.date::text AS off_date,
             to_char(w.marked_at AT TIME ZONE $1, 'YYYY-MM-DD') AS requested,
             (w.date - ((EXTRACT(DOW FROM w.date)::int + 6) % 7))::text AS week_start
      FROM weekoffs w
      JOIN employees e ON e.id = w.employee_id
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ),
    grouped AS (
      SELECT id, emp_code, name, designation, business_unit, department, week_start,
             MAX(requested) AS requested,
             ARRAY_AGG(off_date ORDER BY off_date) AS dates
      FROM filtered
      GROUP BY id, emp_code, name, designation, business_unit, department, week_start
    )`;
  return { cte, params };
}

export async function buildSheetRows(opts: SheetQuery = {}): Promise<SheetRow[]> {
  const built = groupedSheetCte(opts);
  if (!built) return [];
  const rows = await (await db()).q<GroupedMark>(
    `WITH ${built.cte} SELECT emp_code, name, designation, business_unit, department, week_start, requested, dates
     FROM grouped ORDER BY week_start, emp_code`,
    built.params,
  );
  return rows.map(toSheetRow);
}

/** One page of sheet rows. `total` is the full grouped count, not just this page. */
export async function buildSheetPage(
  opts: SheetQuery & { page?: number; pageSize?: number },
): Promise<{ rows: SheetRow[]; total: number; page: number; pageSize: number }> {
  const pageSize = opts.pageSize ?? SHEET_PAGE_SIZE;
  const built = groupedSheetCte(opts);
  if (!built) return { rows: [], total: 0, page: 1, pageSize };
  const e = await db();
  const count = await e.one<{ total: number }>(`WITH ${built.cte} SELECT COUNT(*)::int AS total FROM grouped`, built.params);
  const total = count?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, Math.floor(opts.page ?? 1)), pageCount);
  const rows = await e.q<GroupedMark>(
    `WITH ${built.cte} SELECT emp_code, name, designation, business_unit, department, week_start, requested, dates
     FROM grouped ORDER BY week_start, emp_code
     LIMIT $${built.params.length + 1} OFFSET $${built.params.length + 2}`,
    [...built.params, pageSize, (page - 1) * pageSize],
  );
  return { rows: rows.map(toSheetRow), total, page, pageSize };
}

export function sheetValues(rows: SheetRow[]): string[][] {
  return [SHEET_HEADER, ...rows.map((r) => [r.empId, r.name, r.designation, r.requestDate, r.wo1, r.wo2])];
}

export function sheetCsv(rows: SheetRow[]): string {
  return "﻿" + toCsv(sheetValues(rows));
}
