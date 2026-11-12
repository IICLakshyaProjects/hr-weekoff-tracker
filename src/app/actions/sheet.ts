"use server";

import { requireAdmin } from "@/lib/auth";
import { logActivity } from "@/lib/db";
import { sheetsConfigured, syncAllTabs } from "@/lib/gsheets";
import type { ActionResult } from "@/lib/types";

export async function syncSheetNow(): Promise<ActionResult & { errors?: string[] }> {
  const admin = await requireAdmin();
  if (!sheetsConfigured()) {
    return { ok: false, message: "Google Sheet is not configured yet — add the service account key file (see README)." };
  }
  const errors = await syncAllTabs();
  await logActivity(admin.id, "SHEET_SYNCED", errors.length ? `${errors.length} tab(s) failed` : "all tabs");
  return errors.length
    ? { ok: false, message: `Synced with ${errors.length} error(s).`, errors }
    : { ok: true, message: "All department tabs are up to date with the database." };
}
