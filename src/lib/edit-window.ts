import { addDays, formatPrettyDate, isScheduleEditDay, todayIso } from "./dates";

/** Monday of the Monday–Sunday week containing `iso`. */
export function mondayOf(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return addDays(iso, -((d.getUTCDay() + 6) % 7));
}

/**
 * The week heads can mark today: on Monday–Wednesday, the whole Monday–Sunday week of today
 * (Mon 16 – Wed 18 → 16–22). From Thursday that week is closed; only the super admin can change it.
 */
export function markingWeek(today = todayIso()): { start: string; end: string } | null {
  if (!isScheduleEditDay(today)) return null;
  const start = mondayOf(today);
  return { start, end: addDays(start, 6) };
}

/** True when a head may mark or remove a week off on `date` today. */
export function canMarkDate(date: string, today = todayIso()): boolean {
  const week = markingWeek(today);
  return !!week && date >= week.start && date <= week.end;
}

/** True on Monday–Wednesday, when the current week is open for marking. */
export async function isEditingOpen(today = todayIso()): Promise<boolean> {
  return isScheduleEditDay(today);
}

/** Message shown when a head tries to change a date outside the open week. */
export function closedWeekMessage(date: string, today = todayIso()): string {
  const start = mondayOf(date);
  const range = `${formatPrettyDate(start)} – ${formatPrettyDate(addDays(start, 6))}`;
  const week = markingWeek(today);
  if (week && date > week.end) return `The week ${range} opens for marking on ${formatPrettyDate(start)} (Monday to Wednesday).`;
  return `The week ${range} is closed. It could be marked Monday to Wednesday of that week; now only the super admin can change it.`;
}
