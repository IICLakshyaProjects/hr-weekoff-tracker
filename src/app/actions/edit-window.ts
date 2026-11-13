"use server";

import { revalidatePath } from "next/cache";
import { logActivity, db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { formatPrettyDate, isScheduleEditDay, todayIso } from "@/lib/dates";
import type { ActionResult } from "@/lib/types";

/** Lets heads change week offs today, including when today is not Monday–Wednesday. */
export async function allowEditingToday(): Promise<ActionResult> {
  const admin = await requireAdmin();
  const today = todayIso();
  const label = formatPrettyDate(today);
  if (isScheduleEditDay(today)) {
    return { ok: true, message: `${label} is already open for editing (Monday–Wednesday).` };
  }
  const inserted = await (await db()).run(
    `INSERT INTO edit_day_overrides (date, enabled_by) VALUES ($1, $2) ON CONFLICT (date) DO NOTHING`,
    [today, admin.id],
  );
  await logActivity(admin.id, "EDIT_DAY_ENABLED", today);
  revalidatePath("/", "layout");
  return {
    ok: true,
    message: inserted ? `Editing is enabled for ${label}.` : `Editing was already enabled for ${label}.`,
  };
}
