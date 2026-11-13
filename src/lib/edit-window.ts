import { APP_TZ, db } from "./db";
import { isScheduleEditDay, todayIso } from "./dates";

/** Regular Monday–Wednesday window, or an admin override for this calendar day. */
export async function isEditingOpen(today = todayIso()): Promise<boolean> {
  if (isScheduleEditDay(today)) return true;
  const row = await (await db()).one("SELECT 1 AS ok FROM edit_day_overrides WHERE date = $1", [today]);
  return !!row;
}

export type DayOverride = { enabled_by_name: string | null; enabled_at: string };

export async function todayOverride(today = todayIso()): Promise<DayOverride | null> {
  const row = await (await db()).one<DayOverride>(
    `SELECT e.name AS enabled_by_name,
            to_char(o.enabled_at AT TIME ZONE $2, 'DD-Mon-YYYY HH24:MI') AS enabled_at
     FROM edit_day_overrides o
     LEFT JOIN employees e ON e.id = o.enabled_by
     WHERE o.date = $1`,
    [today, APP_TZ],
  );
  return row ?? null;
}
