import { addDays, formatPrettyDate, formatWeekRange, isScheduleEditDay, mondayOf, todayIso } from "./dates";
import { db } from "./db";

export { mondayOf };

const WEEK_LOCK_KEY = "week_lock_enabled";

/**
 * Super admin switch. Enabled (default): heads mark the current week on Monday–Wednesday only.
 * Disabled: heads can update week offs on any day. Weeks a head saved stay locked either way.
 */
export async function weekLockEnabled(): Promise<boolean> {
  const row = await (await db()).one<{ value: string }>("SELECT value FROM app_settings WHERE key = $1", [WEEK_LOCK_KEY]);
  return row?.value !== "false";
}

export async function setWeekLockEnabled(enabled: boolean, by: number): Promise<void> {
  await (await db()).run(
    `INSERT INTO app_settings (key, value, updated_by, updated_at) VALUES ($1, $2, $3, now())
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`,
    [WEEK_LOCK_KEY, enabled ? "true" : "false", by],
  );
}

/**
 * The week heads can mark today: the Monday–Sunday week of today.
 * With the week lock on, only on Monday–Wednesday (Mon 16 – Wed 18 → 16–22); null from Thursday.
 */
export function markingWeek(today = todayIso(), lockOn = true): { start: string; end: string } | null {
  if (lockOn && !isScheduleEditDay(today)) return null;
  const start = mondayOf(today);
  return { start, end: addDays(start, 6) };
}

/** True when a head may mark or remove a week off on `date` today. */
export function canMarkDate(date: string, today = todayIso(), lockOn = true): boolean {
  if (!lockOn) return true;
  const week = markingWeek(today);
  return !!week && date >= week.start && date <= week.end;
}

/**
 * True when `date` is in a week whose marking window has passed (an earlier week, or this week
 * from Thursday). Heads change those dates through an edit request. Never true with the lock off.
 */
export function weekClosed(date: string, today = todayIso(), lockOn = true): boolean {
  if (!lockOn) return false;
  const week = markingWeek(today);
  return date < (week ? week.start : addDays(mondayOf(today), 7));
}

/** Message shown when a head tries to change a date outside the open week. */
export function closedWeekMessage(date: string, today = todayIso()): string {
  const range = formatWeekRange(date);
  if (!weekClosed(date, today)) return `The week ${range} opens for marking on ${formatPrettyDate(mondayOf(date))} (Monday to Wednesday).`;
  return `The week ${range} is locked. Click the date to request edit access from the super admin.`;
}
