import { requireAdmin } from "@/lib/auth";
import { ImportForm } from "./import-form";

export const instant = false;

export default async function ImportPage() {
  await requireAdmin();
  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Bulk upload employees</h1>
        <p className="text-sm text-slate-500">
          Upload a CSV (or paste rows copied from Excel) to add new employees or update existing ones, matched by <b>Employee Number</b>. For
          existing employees, blank cells keep the current value.
        </p>
      </div>

      <div className="card p-4 text-sm">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-medium">Template columns</h2>
          <a download className="btn" href="/api/template/employees">Download template</a>
        </div>
        <table className="w-full text-left text-xs">
          <tbody className="[&_td]:border-t [&_td]:border-slate-100 [&_td]:py-1.5 [&_td:first-child]:whitespace-nowrap [&_td:first-child]:pr-4 [&_td:first-child]:font-medium">
            <tr><td>Employee Number *</td><td>Unique — used to match existing records</td></tr>
            <tr><td>Full Name *</td><td>Required for new employees</td></tr>
            <tr><td>Email</td><td>Needed later if the person is given portal login</td></tr>
            <tr><td>Job Title</td><td></td></tr>
            <tr><td>Business Unit</td><td></td></tr>
            <tr><td>Department</td><td></td></tr>
            <tr><td>Location</td><td></td></tr>
            <tr><td>Band</td><td></td></tr>
            <tr>
              <td>Reporting To</td>
              <td>
                Employee Number of the head (can be in the same file). A full name, email or “Name (Number)” also works. Anyone others report to is
                made a <b>Department Head</b> so they can see their team. Use “-” to remove the mapping.
              </td>
            </tr>
          </tbody>
        </table>
        <details className="mt-3 text-xs text-slate-600">
          <summary className="cursor-pointer">Optional extra columns</summary>
          <p className="mt-2">
            <b>Phone</b>, <b>Role</b> (ADMIN / HEAD / EMPLOYEE), <b>Portal Access</b> (yes/no, needs Email + Password), <b>Password</b> (min 8
            chars), <b>Can Edit Weekoff</b> (yes/no), <b>Default Weekoff</b> (e.g. SUN or SAT,SUN), <b>Status</b> (ACTIVE / INACTIVE). Portal access
            and roles can also be set afterwards from the Employees page using bulk edit.
          </p>
        </details>
      </div>

      <ImportForm />
    </div>
  );
}
