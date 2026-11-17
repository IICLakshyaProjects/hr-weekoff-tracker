"use server";

import { revalidatePath } from "next/cache";
import { db, logActivity, tx } from "@/lib/db";
import { canEditWeekoff, requireAdmin, requireUser, visibleEmployeeIds } from "@/lib/auth";
import { cycleStart, formatPrettyDate, isIsoDate } from "@/lib/dates";
import { lockKeysFor, periodCovers } from "@/lib/month-lock";
import { departmentKey, departmentLabel, formatLockPeriod } from "@/lib/department";
import type { ActionResult, SessionUser } from "@/lib/types";

/** Departments of the head's own team (and the head). */
async function headDepartments(user: SessionUser): Promise<Set<string>> {
  const visible = await visibleEmployeeIds(user);
  const scope = [...new Set([...(visible ?? []), user.id])];
  const owned = await (await db()).q<{ department: string }>(
    `SELECT DISTINCT btrim(COALESCE(department, '')) AS department
     FROM employees
     WHERE status = 'ACTIVE' AND id = ANY($1::int[])`,
    [scope],
  );
  return new Set(owned.map((r) => r.department));
}

const NOTE_MAX = 500;

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function isLockKey(value: string): boolean {
  if (MONTH_RE.test(value)) return true;
  return isIsoDate(value) && cycleStart(value) === value;
}

/** Department head submits the open departments in view. That cycle (or legacy month) then locks. */
export async function submitMonth(month: string, departments: string[]): Promise<ActionResult> {
  const user = await requireUser();
  if (user.role !== "HEAD" || !user.can_edit_weekoff) {
    return { ok: false, message: "Only a department head who can update week offs can submit." };
  }
  if (!isLockKey(month)) return { ok: false, message: "Invalid week." };

  const keys = [...new Set(departments.map((d) => departmentKey(d)))];
  if (keys.length === 0) return { ok: false, message: "Nothing to submit." };

  const ownedSet = await headDepartments(user);
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
    return { ok: false, message: `${formatLockPeriod(month)} is already locked for ${already.map(departmentLabel).join(", ")}.` };
  }
  const names = submitted.map(departmentLabel).join(", ");
  const extra = already.length ? ` Already locked: ${already.map(departmentLabel).join(", ")}.` : "";
  return { ok: true, message: `${formatLockPeriod(month)} is submitted and locked for ${names}.${extra}` };
}

/** Admin reopens one department for one cycle or legacy month. The next save locks it again. */
export async function allowMonthEdit(department: string, month: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!isLockKey(month)) return { ok: false, message: "Invalid period." };
  const key = departmentKey(department);
  const removed = await tx(async (e) => {
    const n = await e.run("DELETE FROM month_locks WHERE department = $1 AND month = $2", [key, month]);
    if (n) {
      await e.run(
        `UPDATE edit_requests SET status = 'APPROVED', decided_by = $3, decided_at = now()
         WHERE department = $1 AND month = $2 AND status = 'PENDING'`,
        [key, month, admin.id],
      );
      await logActivity(admin.id, "MONTH_REOPENED", `${month}: ${departmentLabel(key)}`, e);
    }
    return n;
  });
  if (!removed) return { ok: false, message: `${departmentLabel(key)} is not locked for ${formatLockPeriod(month)}.` };
  revalidatePath("/", "layout");
  return {
    ok: true,
    message: `${departmentLabel(key)} can edit ${formatLockPeriod(month)} again. It locks the next time a department head saves.`,
  };
}

/**
 * Department head asks the admin to open locked dates, with a note.
 * With `employeeId` (a click on one employee's locked cell) only that employee's date opens;
 * without it (bulk) the dates open for the whole department.
 */
export async function requestEdit(department: string, dates: string[], note: string, employeeId?: number): Promise<ActionResult> {
  const user = await requireUser();
  if (user.role !== "HEAD" || !user.can_edit_weekoff) {
    return { ok: false, message: "Only a department head who can update week offs can request editing." };
  }
  const picked = [...new Set(dates)].sort();
  if (picked.length === 0) return { ok: false, message: "Choose the locked dates you need to change." };
  if (picked.length > 62 || picked.some((d) => !isIsoDate(d))) return { ok: false, message: "Invalid dates." };
  const text = note.trim();
  if (!text) return { ok: false, message: "Add a note for the admin explaining what needs to change." };
  if (text.length > NOTE_MAX) return { ok: false, message: `Keep the note under ${NOTE_MAX} characters.` };

  const key = departmentKey(department);
  if (!(await headDepartments(user)).has(key)) {
    return { ok: false, message: `You cannot request editing for ${departmentLabel(key)}.` };
  }
  let employee: { name: string; emp_code: string } | undefined;
  if (employeeId !== undefined) {
    if (picked.length !== 1) return { ok: false, message: "A request for one employee covers one date." };
    if (!(await canEditWeekoff(user, employeeId))) return { ok: false, message: "You cannot request editing for this employee." };
    employee = await (await db()).one<{ name: string; emp_code: string }>(
      "SELECT name, emp_code FROM employees WHERE id = $1 AND btrim(COALESCE(department, '')) = $2",
      [employeeId, key],
    );
    if (!employee) return { ok: false, message: "This employee is not in that department." };
  }
  const empId = employeeId ?? null;

  const result = await tx(async (e): Promise<ActionResult> => {
    const locks = await e.q<{ month: string }>(
      "SELECT month FROM month_locks WHERE department = $1 AND month = ANY($2::text[])",
      [key, lockKeysFor(picked)],
    );
    const notLocked = picked.filter((d) => !locks.some((l) => periodCovers(l.month, d)));
    if (notLocked.length) {
      return { ok: false, message: `${notLocked.map(formatPrettyDate).join(", ")} ${notLocked.length > 1 ? "are" : "is"} not locked, so no request is needed.` };
    }
    const taken = await e.q<{ date: string }>(
      `SELECT DISTINCT d::text AS date FROM edit_requests, unnest(dates) AS d
       WHERE department = $1 AND (status = 'PENDING' OR (status = 'APPROVED' AND closed_at IS NULL)) AND d = ANY($2::date[])
         AND ($3::int IS NULL OR employee_id IS NULL OR employee_id = $3)`,
      [key, picked, empId],
    );
    if (taken.length) {
      return { ok: false, message: `Already requested or open: ${taken.map((t) => formatPrettyDate(t.date)).join(", ")}.` };
    }
    // `month` records the saved week of the first date (for the activity log and older views).
    const first = locks.filter((l) => periodCovers(l.month, picked[0])).map((l) => l.month).sort().pop()!;
    const created = await e.one<{ id: number }>(
      `INSERT INTO edit_requests (department, month, requested_by, note, dates, employee_id)
       VALUES ($1, $2, $3, $4, $5::date[], $6) RETURNING id`,
      [key, first, user.id, text, picked, empId],
    );
    const scope = employee
      ? `${employee.name} (${employee.emp_code}) · ${picked[0]}`
      : `bulk · ${picked.length} locked date(s): ${picked.join(", ")}`;
    await logActivity(user.id, "EDIT_REQUESTED", `Request #${created!.id} · ${departmentLabel(key)} · ${scope} · Note: ${text}`, e);
    return {
      ok: true,
      message: employee
        ? `Edit request for ${employee.name} on ${formatPrettyDate(picked[0])} sent to the admin.`
        : `Bulk edit request for ${departmentLabel(key)} sent to the admin.`,
    };
  });
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

/** Admin allows (opens only the requested locked dates) or denies a pending edit request, with an optional reply. */
export async function decideEditRequest(id: number, approve: boolean, reply: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const text = reply.trim();
  if (text.length > NOTE_MAX) return { ok: false, message: `Keep the reply under ${NOTE_MAX} characters.` };

  const result = await tx(async (e): Promise<ActionResult> => {
    const req = await e.one<{ department: string; month: string; dates: string[]; requester: string | null; employee: string | null }>(
      `SELECT r.department, r.month, r.dates::text[] AS dates, emp.name AS requester,
              te.name || ' (' || te.emp_code || ')' AS employee
       FROM edit_requests r
       LEFT JOIN employees emp ON emp.id = r.requested_by
       LEFT JOIN employees te ON te.id = r.employee_id
       WHERE r.id = $1 AND r.status = 'PENDING' FOR UPDATE OF r`,
      [id],
    );
    if (!req) return { ok: false, message: "This request has already been handled." };
    const label = req.employee
      ? `${req.employee} on ${formatPrettyDate(req.dates[0])}`
      : `${departmentLabel(req.department)} (bulk request)`;
    await e.run(
      `UPDATE edit_requests SET status = $2, admin_note = $3, decided_by = $4, decided_at = now() WHERE id = $1`,
      [id, approve ? "APPROVED" : "REJECTED", text || null, admin.id],
    );
    await logActivity(
      admin.id,
      approve ? "EDIT_REQUEST_APPROVED" : "EDIT_REQUEST_REJECTED",
      `Request #${id} from ${req.requester ?? "unknown"} · ${departmentLabel(req.department)} · ` +
        (req.employee ? `${req.employee} · ${req.dates[0]}` : `bulk · ${req.dates.join(", ")}`) +
        (text ? ` · Reply: ${text}` : ""),
      e,
    );
    return approve
      ? { ok: true, message: `Editing allowed for ${label}. Everything else stays locked.` }
      : { ok: true, message: `Edit request for ${label} denied.` };
  });
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

/** Head is done changing the opened dates; they are locked again. */
export async function finishEditRequest(id: number): Promise<ActionResult> {
  const user = await requireUser();
  if (user.role !== "HEAD") return { ok: false, message: "Only a department head can do this." };
  const req = await (await db()).one<{ department: string; dates: string[] }>(
    "SELECT department, dates::text[] AS dates FROM edit_requests WHERE id = $1 AND status = 'APPROVED' AND closed_at IS NULL",
    [id],
  );
  if (!req) return { ok: false, message: "These dates are already locked." };
  if (!(await headDepartments(user)).has(req.department)) {
    return { ok: false, message: `You cannot lock ${departmentLabel(req.department)}.` };
  }
  await (await db()).run("UPDATE edit_requests SET closed_at = now() WHERE id = $1", [id]);
  await logActivity(user.id, "EDIT_REQUEST_CLOSED", `Request #${id} · ${departmentLabel(req.department)} · locked again: ${req.dates.join(", ")}`);
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved. Those dates are locked again." };
}
