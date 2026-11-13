import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listDepartments, listEmployees, listHeads } from "@/lib/employees";
import { EmployeesTable } from "./employees-table";

export const instant = false;

export default async function EmployeesPage({ searchParams }: PageProps<"/employees">) {
  const user = await requireUser();
  if (user.role === "EMPLOYEE") redirect("/weekoffs");
  const isAdmin = user.role === "ADMIN";

  const sp = await searchParams;
  const pick = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const q = pick("q");
  const dept = pick("dept");
  const head = pick("head");
  const status = pick("status");

  const employees = await listEmployees(user, {
    q: q || undefined,
    department: dept || undefined,
    managerId: Number(head) || undefined,
    status: status || undefined,
  });
  const heads = isAdmin ? await listHeads() : [];
  const departments = isAdmin ? await listDepartments() : [...new Set(employees.map((e) => e.department).filter(Boolean) as string[])];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{isAdmin ? "Employees" : "My Team"}</h1>
          <p className="text-sm text-slate-500">
            {isAdmin ? "Add, edit, delete and map employees to department heads." : "Employees mapped under you (view only)."}
          </p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <a className="btn" href={`/api/export/employees`}>Export CSV</a>
            <Link className="btn" href="/employees/import">Bulk upload</Link>
            <Link className="btn btn-primary" href="/employees/new">+ Add employee</Link>
          </div>
        )}
      </div>

      <form className="card flex flex-wrap items-end gap-3 p-3" action="/employees">
        <div className="w-56">
          <label className="label">Search</label>
          <input className="input" name="q" defaultValue={q} placeholder="Name, ID or email" />
        </div>
        <div className="w-44">
          <label className="label">Department</label>
          <select className="input" name="dept" defaultValue={dept}>
            <option value="">All</option>
            {departments.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </div>
        {isAdmin && (
          <div className="w-52">
            <label className="label">Reporting head</label>
            <select className="input" name="head" defaultValue={head}>
              <option value="">All</option>
              {heads.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name} ({h.emp_code})
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="w-36">
          <label className="label">Status</label>
          <select className="input" name="status" defaultValue={status}>
            <option value="">All</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>
        <button className="btn btn-primary">Filter</button>
        <Link className="btn" href="/employees">Reset</Link>
      </form>

      <EmployeesTable employees={employees} heads={heads} departments={departments} isAdmin={isAdmin} currentUserId={user.id} />
    </div>
  );
}
