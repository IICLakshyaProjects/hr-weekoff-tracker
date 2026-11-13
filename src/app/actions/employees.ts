"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { applyHeadDefaults, db, logActivity, tx, type Exec } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { requireAdmin } from "@/lib/auth";
import { createsCycle } from "@/lib/employees";
import { syncAllTabs } from "@/lib/gsheets";
import { csvToObjects } from "@/lib/csv";
import { ROLES, WEEKDAYS, type ActionResult, type Role } from "@/lib/types";

// ---------- helpers ----------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function str(v: FormDataEntryValue | null | undefined): string {
  return v == null ? "" : String(v).trim();
}

function parseBool(v: string | undefined): boolean | undefined {
  if (v == null || v === "") return undefined;
  const s = v.toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(s)) return true;
  if (["0", "false", "no", "n", "off"].includes(s)) return false;
  return undefined;
}

/** Normalises "sat, Sun" → "SAT,SUN"; returns null for empty, throws on invalid days. */
function normaliseWeekdays(v: string): string | null {
  if (!v) return null;
  const days = v
    .split(/[,;/| ]+/)
    .map((d) => d.trim().slice(0, 3).toUpperCase())
    .filter(Boolean);
  for (const d of days) {
    if (!(WEEKDAYS as readonly string[]).includes(d)) throw new Error(`Invalid week-off day "${d}"`);
  }
  return [...new Set(days)].join(",") || null;
}

function friendlyDbError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("ux_emp_code")) return "Employee ID already exists.";
  if (msg.includes("ux_emp_email")) return "Email is already used by another employee.";
  return msg;
}

/** Names, designations and business units appear in the Google Sheet, so refresh it after employee changes. */
function refreshSheetLater() {
  after(async () => {
    await syncAllTabs();
  });
}

async function revokeLostAccess(e: Exec) {
  await e.run("DELETE FROM sessions WHERE employee_id IN (SELECT id FROM employees WHERE NOT portal_access OR status <> 'ACTIVE')");
}

// ---------- single create / update ----------

export async function saveEmployee(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const id = Number(formData.get("id")) || null;

  const empCode = str(formData.get("emp_code"));
  const name = str(formData.get("name"));
  const email = str(formData.get("email")) || null;
  const role = str(formData.get("role")) as Role;
  const managerId = Number(formData.get("manager_id")) || null;
  const portalAccess = formData.get("portal_access") === "on";
  const canEdit = formData.get("can_edit_weekoff") === "on";
  const password = str(formData.get("password"));
  const status = str(formData.get("status")) === "INACTIVE" ? "INACTIVE" : "ACTIVE";
  const defaultDays = formData.getAll("default_weekoff").map(String).join(",");

  if (!empCode) return { ok: false, message: "Employee ID is required." };
  if (!name) return { ok: false, message: "Name is required." };
  if (email && !EMAIL_RE.test(email)) return { ok: false, message: "Email is not valid." };
  if (!ROLES.includes(role)) return { ok: false, message: "Invalid role." };
  if (portalAccess && !email) return { ok: false, message: "Email is required to give portal (login) access." };
  if (password && password.length < 8) return { ok: false, message: "Password must be at least 8 characters." };
  if (id && id === admin.id && (!portalAccess || role !== "ADMIN" || status !== "ACTIVE")) {
    return { ok: false, message: "You cannot remove your own admin role or portal access." };
  }

  let defaultWeekoff: string | null;
  try {
    defaultWeekoff = normaliseWeekdays(defaultDays);
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }

  const e = await db();
  if (portalAccess && !password) {
    const existing = id ? await e.one<{ password_hash: string | null }>("SELECT password_hash FROM employees WHERE id = $1", [id]) : undefined;
    if (!existing?.password_hash && role !== "HEAD") return { ok: false, message: "Set a password to give this person portal access." };
  }
  if (id && managerId && (await createsCycle(id, managerId))) {
    return { ok: false, message: "That reporting head would create a reporting loop." };
  }

  const values = [
    empCode,
    name,
    email,
    str(formData.get("phone")) || null,
    str(formData.get("department")) || null,
    str(formData.get("designation")) || null,
    str(formData.get("business_unit")) || null,
    str(formData.get("location")) || null,
    str(formData.get("band")) || null,
    role,
    managerId,
    portalAccess,
    canEdit,
    defaultWeekoff,
    status,
  ];

  try {
    await tx(async (t) => {
      if (id) {
        await t.run(
          `UPDATE employees SET emp_code=$1, name=$2, email=$3, phone=$4, department=$5, designation=$6, business_unit=$7,
             location=$8, band=$9, role=$10, manager_id=$11, portal_access=$12, can_edit_weekoff=$13, default_weekoff=$14,
             status=$15, updated_at=now()
           WHERE id=$16`,
          [...values, id],
        );
        if (password) {
          const force = role === "HEAD" && password === (process.env.HEAD_DEFAULT_PASSWORD ?? "Admin@123");
          await t.run("UPDATE employees SET password_hash = $1, must_change_password = $2 WHERE id = $3", [hashPassword(password), force, id]);
        }
        await logActivity(admin.id, "EMPLOYEE_UPDATED", `${empCode} - ${name}`, t);
      } else {
        await t.run(
          `INSERT INTO employees (emp_code, name, email, phone, department, designation, business_unit, location, band, role,
             manager_id, portal_access, can_edit_weekoff, default_weekoff, status, password_hash)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
          [...values, password ? hashPassword(password) : null],
        );
        await logActivity(admin.id, "EMPLOYEE_CREATED", `${empCode} - ${name}`, t);
      }
      await applyHeadDefaults(t);
      await revokeLostAccess(t);
    });
  } catch (err) {
    return { ok: false, message: friendlyDbError(err) };
  }
  refreshSheetLater();
  revalidatePath("/", "layout");
  redirect("/employees");
}

// ---------- bulk delete / bulk edit ----------

export async function deleteEmployees(ids: number[]): Promise<ActionResult> {
  const admin = await requireAdmin();
  const targets = ids.map(Number).filter((n) => Number.isInteger(n) && n !== admin.id);
  if (targets.length === 0) return { ok: false, message: "Nothing to delete (you cannot delete yourself)." };
  const e = await db();
  const deleted = await e.run("DELETE FROM employees WHERE id = ANY($1::int[])", [targets]);
  await logActivity(admin.id, "EMPLOYEES_DELETED", `${deleted} employee(s)`, e);
  refreshSheetLater();
  revalidatePath("/", "layout");
  return { ok: true, message: `Deleted ${deleted} employee(s).` };
}

export type BulkPatch = {
  department?: string;
  manager_id?: number | null;
  role?: Role;
  portal_access?: boolean;
  can_edit_weekoff?: boolean;
  status?: "ACTIVE" | "INACTIVE";
  default_weekoff?: string;
};

export async function bulkUpdateEmployees(ids: number[], patch: BulkPatch): Promise<ActionResult> {
  const admin = await requireAdmin();
  const targets = ids.map(Number).filter(Number.isInteger);
  if (targets.length === 0) return { ok: false, message: "Select at least one employee." };

  const sets: string[] = [];
  const params: unknown[] = [];
  const set = (col: string, v: unknown) => {
    params.push(v);
    sets.push(`${col} = $${params.length}`);
  };
  if (patch.department !== undefined) set("department", patch.department.trim() || null);
  if (patch.manager_id !== undefined) {
    if (patch.manager_id !== null) {
      for (const t of targets) {
        if (await createsCycle(t, patch.manager_id)) {
          return { ok: false, message: "That reporting head would create a reporting loop for one of the selected employees." };
        }
      }
    }
    set("manager_id", patch.manager_id);
  }
  if (patch.role !== undefined) {
    if (!ROLES.includes(patch.role)) return { ok: false, message: "Invalid role." };
    set("role", patch.role);
  }
  if (patch.can_edit_weekoff !== undefined) set("can_edit_weekoff", patch.can_edit_weekoff);
  if (patch.status !== undefined) set("status", patch.status);
  if (patch.default_weekoff !== undefined) {
    try {
      set("default_weekoff", normaliseWeekdays(patch.default_weekoff));
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
  }

  if (targets.includes(admin.id) && ((patch.role && patch.role !== "ADMIN") || patch.portal_access === false || patch.status === "INACTIVE")) {
    return { ok: false, message: "You cannot remove your own admin role or portal access." };
  }

  const skipped: string[] = [];
  await tx(async (t) => {
    if (sets.length) {
      params.push(targets);
      await t.run(`UPDATE employees SET ${sets.join(", ")}, updated_at = now() WHERE id = ANY($${params.length}::int[])`, params);
    }
    if (patch.portal_access !== undefined) {
      if (patch.portal_access) {
        const missing = await t.q<{ emp_code: string }>(
          "SELECT emp_code FROM employees WHERE id = ANY($1::int[]) AND (email IS NULL OR password_hash IS NULL)",
          [targets],
        );
        skipped.push(...missing.map((m) => m.emp_code));
        await t.run(
          "UPDATE employees SET portal_access = TRUE, updated_at = now() WHERE id = ANY($1::int[]) AND email IS NOT NULL AND password_hash IS NOT NULL",
          [targets],
        );
      } else {
        await t.run("UPDATE employees SET portal_access = FALSE, updated_at = now() WHERE id = ANY($1::int[])", [targets]);
      }
    }
    await applyHeadDefaults(t);
    await revokeLostAccess(t);
    await logActivity(admin.id, "EMPLOYEES_BULK_UPDATED", `${targets.length} employee(s): ${JSON.stringify(patch)}`, t);
  });

  refreshSheetLater();
  revalidatePath("/", "layout");
  const msg = `Updated ${targets.length - skipped.length} employee(s).`;
  return skipped.length
    ? { ok: true, message: `${msg} Portal access not granted to ${skipped.join(", ")} (email and password must be set first).` }
    : { ok: true, message: msg };
}

// ---------- bulk upload (CSV) ----------

export type ImportResult = ActionResult & { created?: number; updated?: number; errors?: string[] };

/** Template columns (HR master format) -> internal keys. Headers are normalised: lowercase, spaces -> "_". */
const HEADER_ALIASES: Record<string, string> = {
  employee_number: "employee_id",
  employee_no: "employee_id",
  emp_no: "employee_id",
  emp_id: "employee_id",
  employee_code: "employee_id",
  full_name: "name",
  employee_name: "name",
  email_id: "email",
  job_title: "designation",
  reporting_head_id: "reporting_to",
  reporting_manager: "reporting_to",
  manager_employee_id: "reporting_to",
};

type ExistingEmployee = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  designation: string | null;
  business_unit: string | null;
  location: string | null;
  band: string | null;
  role: Role;
  portal_access: boolean;
  can_edit_weekoff: boolean;
  default_weekoff: string | null;
  status: string;
  password_hash: string | null;
};

/**
 * Upserts employees, keyed by Employee Number.
 * Template: Employee Number, Full Name, Email, Job Title, Business Unit, Department, Location, Band, Reporting To
 * Optional extra columns: Phone, Role, Portal Access, Can Edit Weekoff, Default Weekoff, Status, Password
 */
export async function importEmployees(_prev: ImportResult | null, formData: FormData): Promise<ImportResult> {
  const admin = await requireAdmin();
  const file = formData.get("file");
  let text = str(formData.get("csv"));
  if (file instanceof File && file.size > 0) {
    if (file.size > 5 * 1024 * 1024) return { ok: false, message: "File is larger than 5 MB." };
    text = await file.text();
  }
  if (!text) return { ok: false, message: "Choose a CSV file or paste CSV content." };

  const rows = csvToObjects(text).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [HEADER_ALIASES[k] ?? k, v])));
  if (rows.length === 0) return { ok: false, message: "The file has no data rows." };
  if (!("employee_id" in rows[0]) || !("name" in rows[0])) {
    return { ok: false, message: "File must contain at least the columns: Employee Number, Full Name." };
  }

  const errors: string[] = [];
  let created = 0;
  let updated = 0;
  let promoted = 0;
  let headsEnabled = 0;

  try {
    await tx(async (t) => {
      /** "Reporting To" may be an Employee Number, "Name (Number)", an email, or a unique full name. */
      async function resolveHead(value: string): Promise<{ id: number } | "ambiguous" | undefined> {
        const byCode = (v: string) => t.one<{ id: number }>("SELECT id FROM employees WHERE lower(emp_code) = lower($1)", [v]);
        const inParens = value.match(/\(([^)]+)\)\s*$/)?.[1]?.trim();
        const hit =
          (await byCode(value)) ??
          (inParens ? await byCode(inParens) : undefined) ??
          (await t.one<{ id: number }>("SELECT id FROM employees WHERE lower(email) = lower($1)", [value]));
        if (hit) return hit;
        const byName = await t.q<{ id: number }>("SELECT id FROM employees WHERE lower(name) = lower($1)", [value]);
        if (byName.length > 1) return "ambiguous";
        return byName[0];
      }

      const managerLinks: { line: number; empCode: string; headCode: string }[] = [];

      for (const [idx, r] of rows.entries()) {
        const line = idx + 2; // 1-based + header
        const empCode = r.employee_id;
        if (!empCode) {
          errors.push(`Row ${line}: Employee Number is empty`);
          continue;
        }
        // For existing employees, blank / missing columns keep the current value.
        const existing = await t.one<ExistingEmployee>("SELECT * FROM employees WHERE lower(emp_code) = lower($1)", [empCode]);
        const name = r.name || existing?.name;
        if (!name) {
          errors.push(`Row ${line}: Full Name is required for new employee ${empCode}`);
          continue;
        }
        const email = r.email || existing?.email || null;
        if (r.email && !EMAIL_RE.test(r.email)) {
          errors.push(`Row ${line}: invalid email "${r.email}"`);
          continue;
        }
        const role = (r.role ? r.role.toUpperCase().replace(/^DEPARTMENT[_ ]?HEAD$|^MANAGER$/, "HEAD") : existing?.role ?? "EMPLOYEE") as Role;
        if (!ROLES.includes(role)) {
          errors.push(`Row ${line}: invalid role "${r.role}" (use ADMIN, HEAD or EMPLOYEE)`);
          continue;
        }
        if (existing?.id === admin.id && role !== "ADMIN") {
          errors.push(`Row ${line}: you cannot remove your own admin role`);
          continue;
        }
        let defaultWeekoff: string | null;
        try {
          defaultWeekoff = r.default_weekoff ? normaliseWeekdays(r.default_weekoff) : existing?.default_weekoff ?? null;
        } catch (e) {
          errors.push(`Row ${line}: ${(e as Error).message}`);
          continue;
        }
        if (r.password && r.password.length < 8) {
          errors.push(`Row ${line}: password must be at least 8 characters`);
          continue;
        }
        const passwordHash = r.password ? hashPassword(r.password) : existing?.password_hash ?? null;
        let portal = parseBool(r.portal_access) ?? existing?.portal_access ?? false;
        if (existing?.id === admin.id) portal = true;
        if (portal && (!email || !passwordHash) && role !== "HEAD") {
          errors.push(`Row ${line}: portal access needs email and password — imported ${empCode} without access`);
          portal = false;
        }
        const status = r.status ? (r.status.toUpperCase() === "INACTIVE" ? "INACTIVE" : "ACTIVE") : existing?.status ?? "ACTIVE";

        const values = [
          name,
          email,
          r.phone || existing?.phone || null,
          r.department || existing?.department || null,
          r.designation || existing?.designation || null,
          r.business_unit || existing?.business_unit || null,
          r.location || existing?.location || null,
          r.band || existing?.band || null,
          role,
          portal,
          parseBool(r.can_edit_weekoff) ?? existing?.can_edit_weekoff ?? false,
          defaultWeekoff,
          existing?.id === admin.id ? "ACTIVE" : status,
          passwordHash,
        ];

        // Savepoint so one bad row (e.g. duplicate email) doesn't abort the whole import.
        await t.run("SAVEPOINT row_sp");
        try {
          if (existing) {
            await t.run(
              `UPDATE employees SET name=$1, email=$2, phone=$3, department=$4, designation=$5, business_unit=$6, location=$7,
                 band=$8, role=$9, portal_access=$10, can_edit_weekoff=$11, default_weekoff=$12, status=$13, password_hash=$14,
                 updated_at=now()
               WHERE id=$15`,
              [...values, existing.id],
            );
            updated++;
          } else {
            await t.run(
              `INSERT INTO employees (name, email, phone, department, designation, business_unit, location, band, role,
                 portal_access, can_edit_weekoff, default_weekoff, status, password_hash, emp_code)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
              [...values, empCode],
            );
            created++;
          }
          if (r.password) {
            const force = role === "HEAD" && r.password === (process.env.HEAD_DEFAULT_PASSWORD ?? "Admin@123");
            await t.run("UPDATE employees SET must_change_password = $1 WHERE lower(emp_code) = lower($2)", [force, empCode]);
          }
          await t.run("RELEASE SAVEPOINT row_sp");
        } catch (err) {
          await t.run("ROLLBACK TO SAVEPOINT row_sp");
          errors.push(`Row ${line}: ${friendlyDbError(err)}`);
          continue;
        }

        // Blank head column = leave unchanged; "-" or "NONE" = remove the mapping.
        const headCode = r.reporting_to;
        if (headCode) managerLinks.push({ line, empCode, headCode: /^(-|none)$/i.test(headCode) ? "" : headCode });
      }

      // Second pass so heads defined later in the same file still resolve.
      for (const link of managerLinks) {
        const emp = (await t.one<{ id: number }>("SELECT id FROM employees WHERE lower(emp_code) = lower($1)", [link.empCode]))!;
        if (!link.headCode) {
          await t.run("UPDATE employees SET manager_id = NULL WHERE id = $1", [emp.id]);
          continue;
        }
        const head = await resolveHead(link.headCode);
        if (head === "ambiguous") {
          errors.push(`Row ${link.line}: Reporting To "${link.headCode}" matches more than one employee - use their Employee Number`);
          continue;
        }
        if (!head) {
          errors.push(`Row ${link.line}: Reporting To "${link.headCode}" not found`);
          continue;
        }
        if (await createsCycle(emp.id, head.id, t)) {
          errors.push(`Row ${link.line}: Reporting To "${link.headCode}" would create a reporting loop`);
          continue;
        }
        await t.run("UPDATE employees SET manager_id = $1 WHERE id = $2", [head.id, emp.id]);
        // Anyone others report to becomes a Department Head so they can see their team.
        promoted += await t.run("UPDATE employees SET role = 'HEAD' WHERE id = $1 AND role = 'EMPLOYEE'", [head.id]);
      }
      headsEnabled = await applyHeadDefaults(t);
      await revokeLostAccess(t);
      await logActivity(admin.id, "EMPLOYEES_IMPORTED", `created ${created}, updated ${updated}, issues ${errors.length}`, t);
    });
  } catch (err) {
    return { ok: false, message: `Import failed: ${friendlyDbError(err)}` };
  }

  refreshSheetLater();
  revalidatePath("/", "layout");
  return {
    ok: true,
    message:
      `Import complete: ${created} created, ${updated} updated` +
      (promoted ? `, ${promoted} set as Department Head` : "") +
      (headsEnabled ? `, ${headsEnabled} head(s) given login (default password)` : "") +
      (errors.length ? `, ${errors.length} issue(s)` : "") +
      ".",
    created,
    updated,
    errors,
  };
}
