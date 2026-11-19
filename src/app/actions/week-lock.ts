"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { logActivity } from "@/lib/db";
import { setWeekLockEnabled } from "@/lib/edit-window";
import type { ActionResult } from "@/lib/types";

/** Super admin turns the Monday–Wednesday week off lock on or off. */
export async function setWeekLock(enabled: boolean): Promise<ActionResult> {
  const admin = await requireAdmin();
  await setWeekLockEnabled(enabled, admin.id);
  await logActivity(admin.id, enabled ? "WEEK_LOCK_ENABLED" : "WEEK_LOCK_DISABLED", enabled ? "Week offs: Monday–Wednesday only" : "Week offs: any day");
  revalidatePath("/", "layout");
  return {
    ok: true,
    message: enabled
      ? "Week off lock enabled. Heads can update the current week only on Monday to Wednesday."
      : "Week off lock disabled. Heads can update week offs on any day.",
  };
}
