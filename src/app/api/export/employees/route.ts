import { getCurrentUser } from "@/lib/auth";
import { listEmployees } from "@/lib/employees";
import { toCsv } from "@/lib/csv";

// Same columns as the bulk upload template (plus portal settings), so an export can be edited and re-uploaded.
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role === "EMPLOYEE") return new Response("Unauthorized", { status: 401 });

  const rows = (await listEmployees(user)).map((e) => [
    e.emp_code,
    e.name,
    e.email,
    e.designation,
    e.business_unit,
    e.department,
    e.location,
    e.band,
    e.manager_code,
    e.role,
    e.portal_access ? "yes" : "no",
    e.can_edit_weekoff ? "yes" : "no",
    e.default_weekoff,
    e.status,
  ]);
  const header = [
    "Employee Number", "Full Name", "Email", "Job Title", "Business Unit", "Department", "Location", "Band", "Reporting To",
    "Role", "Portal Access", "Can Edit Weekoff", "Default Weekoff", "Status",
  ];
  return new Response("﻿" + toCsv([header, ...rows]), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="employees.csv"`,
    },
  });
}
