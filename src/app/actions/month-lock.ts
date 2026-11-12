"use server";

import { revalidatePath } from "next/cache";
import { db, logActivity, tx } from "@/lib/db";
import { requireAdmin, requireUser, visibleEmployeeIds } from "@/lib/auth";
import { departmentKey, departmentLabel, formatMonth } from "@/lib/department";
import type { ActionResult } from "@/lib/types";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Department head submits the open departments in view. The month then locks. */
export async function submitMonth(month: string, departments: string[]): Promise<ActionResult> {
  const user = await requireUser();
  if (user.role !== "HEAD" || !user.can_edit_weekoff) {
    return { ok: false, message: "Only a department head who can update week offs can submit a month." };
  }
  if (!MONTH_RE.test(month)) return { ok: false, message: "Invalid month." };

  const keys = [...new Set(departments.map((d) => departmentKey(d)))];
  if (keys.length === 0) return { ok: false, message: "Nothing to submit." };

  const visible = await visibleEmployeeIds(user);
  const scope = [...new Set([...(visible ?? []), user.id])];
  const owned = await (await db()).q<{ department: string }>(
    `SELECT DISTINCT btrim(COALESCE(department, '')) AS department
     FROM employees
     WHERE status = 'ACTIVE' AND id = ANY($1::int[])`,
    [scope],
  );
  const ownedSet = new Set(owned.map((r) => r.department));
  const denied = keys.filter((k) => !ownedSet.has(k));
  if (denied.length) {
    return { ok: false, message: `You cannot submit ${denied.map(departmentLabel).join(", ")}.` };
  }

  const submitted: string[] = [];
  const already: string[] = [];
  await tx(async (e) => {
    for (const key of keys) {
      const inserted = await e.run(
        `INSERT INTO month_locks (department, month, locked_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (department, month) DO NOTHING`,
        [key, month, user.id],
      );
      (inserted ? submitted : already).push(key);
    }
    await logActivity(
      user.id,
      "MONTH_SUBMITTED",
      `${month}: ${submitted.map(departmentLabel).join(", ") || "already locked"}`,
      e,
    );
  });

  revalidatePath("/", "layout");
  if (submitted.length === 0) {
    return { ok: false, message: `${formatMonth(month)} is already locked for ${already.map(departmentLabel).join(", ")}.` };
  }
  const names = submitted.map(departmentLabel).join(", ");
  const extra = already.length ? ` Already locked: ${already.map(departmentLabel).join(", ")}.` : "";
  return { ok: true, message: `${formatMonth(month)} is submitted and locked for ${names}.${extra}` };
}

/** Admin reopens one department for one month. The next save locks it again. */
export async function allowMonthEdit(department: string, month: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!MONTH_RE.test(month)) return { ok: false, message: "Invalid month." };
  const key = departmentKey(department);
  const removed = await (await db()).run("DELETE FROM month_locks WHERE department = $1 AND month = $2", [key, month]);
  if (!removed) return { ok: false, message: `${departmentLabel(key)} is not locked for ${formatMonth(month)}.` };
  await logActivity(admin.id, "MONTH_REOPENED", `${month}: ${departmentLabel(key)}`);
  revalidatePath("/", "layout");
  return {
    ok: true,
    message: `${departmentLabel(key)} can edit ${formatMonth(month)} again. It locks the next time a department head saves.`,
  };
}
