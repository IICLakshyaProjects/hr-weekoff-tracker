"use client";

import Link from "next/link";
import { startTransition, useActionState, useState } from "react";
import { saveEmployee } from "@/app/actions/employees";
import { ROLE_LABEL, ROLES, WEEKDAYS, type Employee } from "@/lib/types";

type Head = { id: number; name: string; emp_code: string; department: string | null };

export function EmployeeForm({
  employee,
  heads,
  departments,
}: {
  employee?: Employee;
  heads: Head[];
  departments: string[];
}) {
  const [state, action, pending] = useActionState(saveEmployee, null);
  const [portal, setPortal] = useState(!!employee?.portal_access);
  const defaultDays = new Set((employee?.default_weekoff ?? "").split(",").filter(Boolean));
  const hasPassword = !!employee?.portal_access; // a user with access always has a password

  return (
    <form
      className="card max-w-3xl space-y-6 p-6"
      onSubmit={(e) => {
        // Submit manually so the form keeps what was typed if validation fails.
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
    >
      {employee && <input type="hidden" name="id" value={employee.id} />}

      <section className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Employee Number *</label>
          <input className="input" name="emp_code" required defaultValue={employee?.emp_code} />
        </div>
        <div>
          <label className="label">Full name *</label>
          <input className="input" name="name" required defaultValue={employee?.name} />
        </div>
        <div>
          <label className="label">Email ID {portal && "*"}</label>
          <input className="input" type="email" name="email" required={portal} defaultValue={employee?.email ?? ""} />
        </div>
        <div>
          <label className="label">Phone</label>
          <input className="input" name="phone" defaultValue={employee?.phone ?? ""} />
        </div>
        <div>
          <label className="label">Department</label>
          <input className="input" name="department" list="dept-options" defaultValue={employee?.department ?? ""} />
          <datalist id="dept-options">
            {departments.map((d) => <option key={d} value={d} />)}
          </datalist>
        </div>
        <div>
          <label className="label">Job Title</label>
          <input className="input" name="designation" defaultValue={employee?.designation ?? ""} />
        </div>
        <div>
          <label className="label">Business Unit</label>
          <input className="input" name="business_unit" defaultValue={employee?.business_unit ?? ""} />
        </div>
        <div>
          <label className="label">Location</label>
          <input className="input" name="location" defaultValue={employee?.location ?? ""} />
        </div>
        <div>
          <label className="label">Band</label>
          <input className="input" name="band" defaultValue={employee?.band ?? ""} />
        </div>
      </section>

      <section className="grid gap-4 border-t border-slate-100 pt-6 sm:grid-cols-2">
        <div>
          <label className="label">Role *</label>
          <select className="input" name="role" defaultValue={employee?.role ?? "EMPLOYEE"}>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
          <p className="mt-1 text-xs text-slate-500">Department Heads can see only the employees mapped under them.</p>
        </div>
        <div>
          <label className="label">Reporting / Department head</label>
          <select className="input" name="manager_id" defaultValue={employee?.manager_id ?? ""}>
            <option value="">— None —</option>
            {heads
              .filter((h) => h.id !== employee?.id)
              .map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name} ({h.emp_code}){h.department ? ` – ${h.department}` : ""}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label className="label">Status</label>
          <select className="input" name="status" defaultValue={employee?.status ?? "ACTIVE"}>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>
        <div>
          <label className="label">Default week-off day(s)</label>
          <div className="flex flex-wrap gap-1">
            {WEEKDAYS.map((d) => (
              <label key={d} className="flex cursor-pointer items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs has-checked:border-indigo-600 has-checked:bg-indigo-600 has-checked:text-white">
                <input type="checkbox" name="default_weekoff" value={d} defaultChecked={defaultDays.has(d)} className="hidden" />
                {d}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-500">Used by “Auto-fill default week offs”.</p>
        </div>
      </section>

      <section className="space-y-3 border-t border-slate-100 pt-6">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="portal_access" checked={portal} onChange={(e) => setPortal(e.target.checked)} className="mt-0.5" />
          <span>
            <span className="font-medium">Portal (login) access</span>
            <span className="block text-xs text-slate-500">Logs in with Employee ID + Email ID + password. Without this the person cannot sign in.</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="can_edit_weekoff" defaultChecked={!!employee?.can_edit_weekoff} className="mt-0.5" />
          <span>
            <span className="font-medium">Can update week offs</span>
            <span className="block text-xs text-slate-500">
              Heads: for employees mapped under them. Employees: for themselves only. Admins can always update.
            </span>
          </span>
        </label>
        {portal && (
          <div className="max-w-sm">
            <label className="label">{hasPassword ? "Reset password (leave blank to keep)" : "Password *"}</label>
            <input className="input" type="password" name="password" minLength={8} required={!hasPassword} autoComplete="new-password" />
          </div>
        )}
      </section>

      {state && !state.ok && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.message}</p>}
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : employee ? "Save changes" : "Create employee"}</button>
        <Link className="btn" href="/employees">Cancel</Link>
      </div>
    </form>
  );
}
