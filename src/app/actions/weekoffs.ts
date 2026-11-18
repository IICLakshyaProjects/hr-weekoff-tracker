"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { db, logActivity, tx } from "@/lib/db";
import { canEditWeekoff, requireUser } from "@/lib/auth";
import { daysInMonth, isIsoDate, parseMonth } from "@/lib/dates";
import { isEditingOpen } from "@/lib/edit-window";
import { formatDayDate, MAX_WEEKOFFS_PER_WEEK, weekoffsInWeek } from "@/lib/sheet";
import { businessUnitsOf, syncBusinessUnits } from "@/lib/gsheets";
import { monthLockMessage, openEditRequestFor } from "@/lib/month-lock";
import type { ActionResult } from "@/lib/types";

/** Saved to the database first; the matching Google Sheet tab(s) are refreshed right after the response. */
function syncSheetFor(employeeIds: number[]) {
  after(async () => {
    await syncBusinessUnits(await businessUnitsOf(employeeIds));
  });
}

export async function toggleWeekoff(employeeId: number, date: string): Promise<ActionResult & { marked?: boolean }> {
  const user = await requireUser();
  if (!isIsoDate(date)) return { ok: false, message: "Invalid date." };
  if (!(await canEditWeekoff(user, employeeId))) return { ok: false, message: "You are not allowed to update this employee's week off." };
  // A date the admin allowed through an edit request can be changed on any day.
  const requestId = await openEditRequestFor(await db(), employeeId, date);
  if (!requestId && !(await isEditingOpen())) {
    return { ok: false, message: "Week offs can be updated on Monday, Tuesday, and Wednesday. An admin can allow editing for today." };
  }
  const via = requestId ? ` (edit request #${requestId})` : "";

  const result = await tx(async (e) => {
    // One change per employee at a time, so quick clicks can't exceed the weekly limit.
    await e.run("SELECT pg_advisory_xact_lock($1)", [employeeId]);
    const locked = await monthLockMessage(e, employeeId, date);
    if (locked) return { ok: false, message: locked };
    if (await e.run("DELETE FROM weekoffs WHERE employee_id = $1 AND date = $2", [employeeId, date])) {
      await logActivity(user.id, "WEEKOFF_REMOVED", `employee #${employeeId} on ${date}${via}`, e);
      return { ok: true, message: "Week off removed.", marked: false };
    }
    if ((await weekoffsInWeek(e, employeeId, date)) >= MAX_WEEKOFFS_PER_WEEK) {
      return {
        ok: false,
        message: `Only ${MAX_WEEKOFFS_PER_WEEK} week offs are allowed in a week (Mon–Sun). Remove one before marking ${formatDayDate(date)}.`,
      };
    }
    await e.run("INSERT INTO weekoffs (employee_id, date, marked_by) VALUES ($1, $2, $3)", [employeeId, date, user.id]);
    await logActivity(user.id, "WEEKOFF_MARKED", `employee #${employeeId} on ${date}${via}`, e);
    return { ok: true, message: "Week off marked.", marked: true };
  });
  if (result.ok) syncSheetFor([employeeId]);
  return result;
}

/** Marks every day in the month that matches each employee's default week-off day(s). */
export async function applyDefaultWeekoffs(month: string, employeeIds: number[]): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await isEditingOpen())) {
    return { ok: false, message: "Week offs can be updated on Monday, Tuesday, and Wednesday. An admin can allow editing for today." };
  }
  const { year, month: m } = parseMonth(month, new Date());
  const days = daysInMonth(year, m);

  let added = 0;
  let skipped = 0;
  let capped = 0;
  let locked = 0;
  const touched: number[] = [];
  await tx(async (e) => {
    for (const id of employeeIds) {
      if (!(await canEditWeekoff(user, id))) continue;
      if (await monthLockMessage(e, id, days[0].date)) {
        locked++;
        continue;
      }
      const row = await e.one<{ default_weekoff: string | null }>("SELECT default_weekoff FROM employees WHERE id = $1 AND status = 'ACTIVE'", [id]);
      if (!row?.default_weekoff) {
        skipped++;
        continue;
      }
      const set = new Set(row.default_weekoff.split(","));
      for (const d of days) {
        if (!set.has(d.weekday) || (await e.one("SELECT 1 FROM weekoffs WHERE employee_id = $1 AND date = $2", [id, d.date]))) continue;
        if ((await weekoffsInWeek(e, id, d.date)) >= MAX_WEEKOFFS_PER_WEEK) {
          capped++;
          continue;
        }
        await e.run("INSERT INTO weekoffs (employee_id, date, marked_by) VALUES ($1, $2, $3)", [id, d.date, user.id]);
        added++;
        touched.push(id);
      }
    }
    await logActivity(user.id, "WEEKOFF_AUTOFILL", `${month}: ${added} day(s) added`, e);
  });
  syncSheetFor(touched);
  revalidatePath("/", "layout");
  return {
    ok: true,
    message:
      `Added ${added} week off day(s).` +
      (skipped ? ` ${skipped} employee(s) have no default week-off day set.` : "") +
      (capped ? ` ${capped} day(s) skipped — already ${MAX_WEEKOFFS_PER_WEEK} week offs in that week.` : "") +
      (locked ? ` ${locked} employee(s) skipped — that month is locked.` : ""),
  };
}

export async function clearMonthWeekoffs(month: string, employeeIds: number[]): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await isEditingOpen())) {
    return { ok: false, message: "Week offs can be updated on Monday, Tuesday, and Wednesday. An admin can allow editing for today." };
  }
  const { year, month: m } = parseMonth(month, new Date());
  const days = daysInMonth(year, m);
  const from = days[0].date;
  let removed = 0;
  let blocked = 0;
  const allowed: number[] = [];
  const e = await db();
  for (const id of employeeIds) {
    if (!(await canEditWeekoff(user, id))) continue;
    if (await monthLockMessage(e, id, days[0].date)) blocked++;
    else allowed.push(id);
  }
  if (allowed.length && from <= days[days.length - 1].date) {
    removed = await e.run("DELETE FROM weekoffs WHERE employee_id = ANY($1::int[]) AND date BETWEEN $2 AND $3", [
      allowed,
      from,
      days[days.length - 1].date,
    ]);
    await logActivity(user.id, "WEEKOFF_CLEARED", `${month}: ${removed} day(s) removed`, e);
  }
  syncSheetFor(allowed);
  revalidatePath("/", "layout");
  return { ok: true, message: `Removed ${removed} week off day(s).` + (blocked ? ` ${blocked} employee(s) skipped — that month is locked.` : "") };
}
