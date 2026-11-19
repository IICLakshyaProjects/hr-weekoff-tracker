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

function validDates(dates: unknown): dates is string[] {
  return Array.isArray(dates) && dates.length >= 1 && dates.length <= MAX_WEEKOFFS_PER_WEEK && dates.every((d) => typeof d === "string" && isIsoDate(d));
}

/**
 * Deletes a sheet row: the employee's week off(s) in one week.
 * Admins can delete any time; others follow the grid's rules (edit window, locks, approved requests).
 */
export async function deleteSheetWeekoffs(employeeId: number, dates: string[]): Promise<ActionResult> {
  const user = await requireUser();
  if (!Number.isInteger(employeeId) || !validDates(dates)) return { ok: false, message: "Invalid week off." };
  if (!(await canEditWeekoff(user, employeeId))) return { ok: false, message: "You are not allowed to delete this employee's week off." };
  const admin = user.role === "ADMIN";
  const requestIds: number[] = [];
  if (!admin) {
    for (const d of dates) {
      const id = await openEditRequestFor(await db(), employeeId, d);
      if (id) requestIds.push(id);
    }
    if (requestIds.length < dates.length && !(await isEditingOpen())) {
      return { ok: false, message: "Week offs can be updated on Monday, Tuesday, and Wednesday. An admin can allow editing for today." };
    }
  }
  const via = requestIds.length ? ` (edit request #${[...new Set(requestIds)].join(", #")})` : "";

  const result = await tx(async (e): Promise<ActionResult> => {
    await e.run("SELECT pg_advisory_xact_lock($1)", [employeeId]);
    if (!admin) {
      for (const d of dates) {
        const locked = await monthLockMessage(e, employeeId, d);
        if (locked) return { ok: false, message: locked };
      }
    }
    const emp = await e.one<{ emp_code: string; name: string }>("SELECT emp_code, name FROM employees WHERE id = $1", [employeeId]);
    const removed = await e.run("DELETE FROM weekoffs WHERE employee_id = $1 AND date = ANY($2::date[])", [employeeId, dates]);
    if (!removed) return { ok: false, message: "That week off was already removed. Refresh the sheet." };
    const who = emp ? `${emp.name} (${emp.emp_code})` : `employee #${employeeId}`;
    await logActivity(user.id, "WEEKOFF_REMOVED", `${who} on ${dates.join(", ")} · deleted from sheet${via}`, e);
    return { ok: true, message: `Deleted ${removed} week off day(s).` };
  });
  if (result.ok) {
    syncSheetFor([employeeId]);
    revalidatePath("/", "layout");
  }
  return result;
}

/**
 * Super admin only: replaces a sheet row's week off dates.
 * `newDates` has one date (Date - 1 = Working) or two dates.
 */
export async function updateSheetWeekoffs(employeeId: number, oldDates: string[], newDates: string[]): Promise<ActionResult> {
  const user = await requireUser();
  if (user.role !== "ADMIN") return { ok: false, message: "Only the super admin can edit week offs here." };
  if (!Number.isInteger(employeeId) || !validDates(oldDates) || !validDates(newDates)) return { ok: false, message: "Choose valid dates." };
  const next = [...new Set(newDates)].sort();
  if (next.length !== newDates.length) return { ok: false, message: "Date - 1 and Date - 2 must be different days." };
  const before = [...oldDates].sort();
  if (before.join() === next.join()) return { ok: false, message: "Nothing changed." };

  const result = await tx(async (e): Promise<ActionResult> => {
    await e.run("SELECT pg_advisory_xact_lock($1)", [employeeId]);
    const emp = await e.one<{ emp_code: string; name: string }>("SELECT emp_code, name FROM employees WHERE id = $1", [employeeId]);
    if (!emp) return { ok: false, message: "Employee not found." };
    const have = await e.one<{ c: number }>("SELECT COUNT(*)::int AS c FROM weekoffs WHERE employee_id = $1 AND date = ANY($2::date[])", [employeeId, before]);
    if ((have?.c ?? 0) !== before.length) return { ok: false, message: "This week off changed meanwhile. Refresh the sheet." };

    // Days that stay keep their request date; only the changed days are replaced.
    const removed = before.filter((d) => !next.includes(d));
    const added = next.filter((d) => !before.includes(d));
    await e.run("DELETE FROM weekoffs WHERE employee_id = $1 AND date = ANY($2::date[])", [employeeId, removed]);
    for (const d of added) {
      if (await e.one("SELECT 1 FROM weekoffs WHERE employee_id = $1 AND date = $2", [employeeId, d])) {
        throw new SheetEditError(`${emp.name} already has a week off on ${formatDayDate(d)}.`);
      }
      if ((await weekoffsInWeek(e, employeeId, d)) >= MAX_WEEKOFFS_PER_WEEK) {
        throw new SheetEditError(`${emp.name} already has ${MAX_WEEKOFFS_PER_WEEK} week offs in the week of ${formatDayDate(d)}.`);
      }
      await e.run("INSERT INTO weekoffs (employee_id, date, marked_by) VALUES ($1, $2, $3)", [employeeId, d, user.id]);
    }
    const show = (ds: string[]) => (ds.length === 1 ? `Working, ${ds[0]}` : ds.join(", "));
    await logActivity(user.id, "WEEKOFF_CHANGED", `${emp.name} (${emp.emp_code}): ${show(before)} → ${show(next)} · edited from sheet`, e);
    return { ok: true, message: "Week off updated." };
  }).catch((err) => {
    if (err instanceof SheetEditError) return { ok: false, message: err.message } as ActionResult;
    throw err;
  });
  if (result.ok) {
    syncSheetFor([employeeId]);
    revalidatePath("/", "layout");
  }
  return result;
}

/** Thrown inside the edit transaction so the delete above it is rolled back. */
class SheetEditError extends Error {}

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
