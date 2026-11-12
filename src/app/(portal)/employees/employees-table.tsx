"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { bulkUpdateEmployees, deleteEmployees, type BulkPatch } from "@/app/actions/employees";
import { ROLE_LABEL, ROLES, WEEKDAYS, type Employee, type Role } from "@/lib/types";

type Head = { id: number; name: string; emp_code: string };
type Field = "" | "department" | "manager_id" | "role" | "portal_access" | "can_edit_weekoff" | "status" | "default_weekoff";

const FIELD_LABEL: Record<Exclude<Field, "">, string> = {
  department: "Department",
  manager_id: "Reporting head",
  role: "Role",
  portal_access: "Portal (login) access",
  can_edit_weekoff: "Can update week offs",
  status: "Status",
  default_weekoff: "Default week-off day(s)",
};

export function EmployeesTable({
  employees,
  heads,
  departments,
  isAdmin,
  currentUserId,
}: {
  employees: Employee[];
  heads: Head[];
  departments: string[];
  isAdmin: boolean;
  currentUserId: number;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [field, setField] = useState<Field>("");
  const [value, setValue] = useState("");
  const [days, setDays] = useState<string[]>([]);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const allSelected = employees.length > 0 && employees.every((e) => selected.has(e.id));
  const toggleOne = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  function run(fn: () => Promise<{ ok: boolean; message: string }>) {
    startTransition(async () => {
      const res = await fn();
      setMessage({ ok: res.ok, text: res.message });
      if (res.ok) {
        setSelected(new Set());
        setField("");
        setValue("");
        setDays([]);
      }
    });
  }

  function applyBulk() {
    if (!field) return;
    const patch: BulkPatch = {};
    switch (field) {
      case "department":
        patch.department = value;
        break;
      case "manager_id":
        patch.manager_id = value ? Number(value) : null;
        break;
      case "role":
        patch.role = value as Role;
        break;
      case "portal_access":
        patch.portal_access = value === "yes";
        break;
      case "can_edit_weekoff":
        patch.can_edit_weekoff = value === "yes";
        break;
      case "status":
        patch.status = value as "ACTIVE" | "INACTIVE";
        break;
      case "default_weekoff":
        patch.default_weekoff = days.join(",");
        break;
    }
    run(() => bulkUpdateEmployees([...selected], patch));
  }

  function removeSelected(ids: number[]) {
    if (!confirm(`Delete ${ids.length} employee(s)? Their week-off history will also be deleted. This cannot be undone.`)) return;
    run(() => deleteEmployees(ids));
  }

  const needsValue = field && field !== "default_weekoff" && field !== "department" && field !== "manager_id";

  return (
    <div className="space-y-3">
      {isAdmin && selected.size > 0 && (
        <div className="card flex flex-wrap items-end gap-3 border-indigo-200 bg-indigo-50/50 p-3">
          <div className="self-center text-sm font-medium">{selected.size} selected</div>
          <div className="w-52">
            <label className="label">Bulk edit field</label>
            <select
              className="input"
              value={field}
              onChange={(e) => {
                setField(e.target.value as Field);
                setValue("");
                setDays([]);
              }}
            >
              <option value="">Choose…</option>
              {Object.entries(FIELD_LABEL).map(([k, l]) => (
                <option key={k} value={k}>{l}</option>
              ))}
            </select>
          </div>
          {field === "department" && (
            <div className="w-48">
              <label className="label">New department</label>
              <input className="input" list="dept-list" value={value} onChange={(e) => setValue(e.target.value)} />
              <datalist id="dept-list">
                {departments.map((d) => <option key={d} value={d} />)}
              </datalist>
            </div>
          )}
          {field === "manager_id" && (
            <div className="w-56">
              <label className="label">Map under head</label>
              <select className="input" value={value} onChange={(e) => setValue(e.target.value)}>
                <option value="">— No reporting head —</option>
                {heads.map((h) => (
                  <option key={h.id} value={h.id}>{h.name} ({h.emp_code})</option>
                ))}
              </select>
            </div>
          )}
          {field === "role" && (
            <div className="w-44">
              <label className="label">Role</label>
              <select className="input" value={value} onChange={(e) => setValue(e.target.value)}>
                <option value="">Choose…</option>
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </div>
          )}
          {(field === "portal_access" || field === "can_edit_weekoff") && (
            <div className="w-36">
              <label className="label">Set to</label>
              <select className="input" value={value} onChange={(e) => setValue(e.target.value)}>
                <option value="">Choose…</option>
                <option value="yes">{field === "portal_access" ? "Grant" : "Yes"}</option>
                <option value="no">{field === "portal_access" ? "Revoke" : "No"}</option>
              </select>
            </div>
          )}
          {field === "status" && (
            <div className="w-36">
              <label className="label">Status</label>
              <select className="input" value={value} onChange={(e) => setValue(e.target.value)}>
                <option value="">Choose…</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>
          )}
          {field === "default_weekoff" && (
            <div>
              <label className="label">Default week-off day(s)</label>
              <div className="flex gap-1">
                {WEEKDAYS.map((d) => (
                  <label key={d} className={`cursor-pointer rounded border px-2 py-1 text-xs ${days.includes(d) ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white"}`}>
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={days.includes(d)}
                      onChange={() => setDays((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d]))}
                    />
                    {d}
                  </label>
                ))}
              </div>
            </div>
          )}
          <button className="btn btn-primary" disabled={pending || !field || (needsValue && !value) || false} onClick={applyBulk}>
            Apply to selected
          </button>
          <button className="btn btn-danger ml-auto" disabled={pending} onClick={() => removeSelected([...selected])}>
            Delete selected
          </button>
        </div>
      )}

      {message && (
        <div className={`rounded-md px-3 py-2 text-sm ${message.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
          {message.text}
          <button className="ml-3 underline" onClick={() => setMessage(null)}>dismiss</button>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {isAdmin && (
                <th className="w-8 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(employees.map((e) => e.id)))}
                  />
                </th>
              )}
              <th className="px-3 py-2">Employee</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Department</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Reporting head</th>
              <th className="px-3 py-2">Default WO</th>
              <th className="px-3 py-2">Access</th>
              <th className="px-3 py-2">Status</th>
              {isAdmin && <th className="px-3 py-2" />}
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-slate-500">No employees found.</td>
              </tr>
            )}
            {employees.map((e) => (
              <tr key={e.id} className={`border-t border-slate-100 ${selected.has(e.id) ? "bg-indigo-50/40" : ""}`}>
                {isAdmin && (
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggleOne(e.id)} />
                  </td>
                )}
                <td className="px-3 py-2">
                  <div className="font-medium">{e.name}</div>
                  <div className="text-xs text-slate-500">
                    {e.emp_code}
                    {e.designation ? ` · ${e.designation}` : ""}
                    {e.band ? ` · Band ${e.band}` : ""}
                  </div>
                </td>
                <td className="px-3 py-2 text-slate-600">{e.email ?? "—"}</td>
                <td className="px-3 py-2">
                  <div>{e.department ?? "—"}</div>
                  {(e.business_unit || e.location) && (
                    <div className="text-xs text-slate-500">{[e.business_unit, e.location].filter(Boolean).join(" · ")}</div>
                  )}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`badge ${
                      e.role === "ADMIN" ? "bg-purple-100 text-purple-800" : e.role === "HEAD" ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {ROLE_LABEL[e.role]}
                  </span>
                </td>
                <td className="px-3 py-2">{e.manager_name ? `${e.manager_name} (${e.manager_code})` : "—"}</td>
                <td className="px-3 py-2 text-xs">{e.default_weekoff ?? "—"}</td>
                <td className="px-3 py-2 text-xs">
                  {e.portal_access ? <span className="badge bg-green-100 text-green-800">Login</span> : <span className="text-slate-400">No login</span>}
                  {e.can_edit_weekoff ? <span className="badge ml-1 bg-amber-100 text-amber-800">Can update WO</span> : null}
                </td>
                <td className="px-3 py-2 text-xs">
                  {e.status === "ACTIVE" ? <span className="text-green-700">Active</span> : <span className="text-slate-400">Inactive</span>}
                </td>
                {isAdmin && (
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <Link className="text-indigo-600 hover:underline" href={`/employees/${e.id}`}>Edit</Link>
                    {e.id !== currentUserId && (
                      <button className="ml-3 text-red-600 hover:underline" disabled={pending} onClick={() => removeSelected([e.id])}>
                        Delete
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">{employees.length} employee(s)</p>
    </div>
  );
}
