import { MONTH_NAMES, formatCycleRange, isIsoDate } from "./dates";

/** Stored key for an employee with no department. */
export function departmentKey(department: string | null | undefined): string {
  return (department ?? "").trim();
}

export function departmentLabel(key: string): string {
  return key || "No department";
}

/** "2026-11" → "November 2026". */
export function formatMonth(ym: string): string {
  const [y, m] = ym.split("-");
  const idx = Number(m) - 1;
  if (!y || idx < 0 || idx > 11) return ym;
  return `${MONTH_NAMES[idx]} ${y}`;
}

/** A locked month ("2026-11") or a Wednesday–Wednesday cycle ("2026-11-11"). */
export function formatLockPeriod(key: string): string {
  return isIsoDate(key) ? formatCycleRange(key) : formatMonth(key);
}
