import { db, type Exec } from "./db";
import type { Employee, SessionUser } from "./types";
import { visibleEmployeeIds } from "./auth";

const BASE_SELECT = `
  SELECT e.id, e.emp_code, e.name, e.email, e.phone, e.department, e.designation, e.business_unit, e.location, e.band, e.role,
         e.manager_id, m.name AS manager_name, m.emp_code AS manager_code,
         e.portal_access, e.can_edit_weekoff, e.default_weekoff, e.status, e.created_at::text, e.updated_at::text
  FROM employees e LEFT JOIN employees m ON m.id = e.manager_id`;

export type EmployeeFilter = {
  q?: string;
  department?: string;
  managerId?: number;
  status?: string;
};

/** Lists employees the user is allowed to see, applying optional filters. */
export async function listEmployees(user: SessionUser, filter: EmployeeFilter = {}): Promise<Employee[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };

  const ids = await visibleEmployeeIds(user);
  if (ids !== null) {
    if (ids.length === 0) return [];
    where.push(`e.id = ANY(${p(ids)}::int[])`);
  }
  if (filter.q) {
    const like = p(`%${filter.q}%`);
    where.push(`(e.name ILIKE ${like} OR e.emp_code ILIKE ${like} OR e.email ILIKE ${like})`);
  }
  if (filter.department) where.push(`e.department = ${p(filter.department)}`);
  if (filter.managerId) where.push(`e.manager_id = ${p(filter.managerId)}`);
  if (filter.status) where.push(`e.status = ${p(filter.status)}`);

  const sql = `${BASE_SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY e.department NULLS LAST, e.name`;
  return (await db()).q<Employee>(sql, params);
}

export async function getEmployee(id: number): Promise<Employee | undefined> {
  return (await db()).one<Employee>(`${BASE_SELECT} WHERE e.id = $1`, [id]);
}

export async function listDepartments(): Promise<string[]> {
  const rows = await (await db()).q<{ department: string }>(
    "SELECT DISTINCT department FROM employees WHERE department IS NOT NULL AND department <> '' ORDER BY department",
  );
  return rows.map((r) => r.department);
}

/** Employees that can be chosen as a reporting head (heads and admins). */
export async function listHeads(): Promise<{ id: number; name: string; emp_code: string; department: string | null }[]> {
  return (await db()).q(
    "SELECT id, name, emp_code, department FROM employees WHERE role IN ('HEAD','ADMIN') AND status = 'ACTIVE' ORDER BY name",
  );
}

/** True if making `managerId` the head of `employeeId` would create a reporting loop. */
export async function createsCycle(employeeId: number, managerId: number, e?: Exec): Promise<boolean> {
  if (employeeId === managerId) return true;
  const row = await (e ?? (await db())).one(
    `WITH RECURSIVE chain(id) AS (
       SELECT manager_id FROM employees WHERE id = $1
       UNION
       SELECT e.manager_id FROM employees e JOIN chain c ON e.id = c.id WHERE e.manager_id IS NOT NULL
     )
     SELECT 1 AS hit FROM chain WHERE id = $2 LIMIT 1`,
    [managerId, employeeId],
  );
  return !!row;
}
