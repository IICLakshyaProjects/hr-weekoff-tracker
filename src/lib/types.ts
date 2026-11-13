export type Role = "ADMIN" | "HEAD" | "EMPLOYEE";
export const ROLES: Role[] = ["ADMIN", "HEAD", "EMPLOYEE"];
export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Admin",
  HEAD: "Department Head",
  EMPLOYEE: "Employee",
};

export const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export type Employee = {
  id: number;
  emp_code: string;
  name: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  designation: string | null;
  business_unit: string | null;
  location: string | null;
  band: string | null;
  role: Role;
  manager_id: number | null;
  manager_name: string | null;
  manager_code: string | null;
  portal_access: boolean;
  can_edit_weekoff: boolean;
  default_weekoff: string | null;
  status: "ACTIVE" | "INACTIVE";
  created_at: string;
  updated_at: string;
};

export type SessionUser = {
  id: number;
  emp_code: string;
  name: string;
  email: string;
  role: Role;
  can_edit_weekoff: boolean;
  must_change_password: boolean;
};

export type ActionResult = { ok: boolean; message: string };
