import Link from "next/link";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { formatPrettyDate } from "@/lib/dates";
import { listEditRequests, listMonthLocks, pendingEditRequestCount } from "@/lib/month-lock";
import { departmentLabel } from "@/lib/department";
import { EditRequests } from "./edit-requests";
import { MonthLocks } from "../employees/month-locks";

export const instant = false;

export default async function EditingPage({ searchParams }: PageProps<"/editing">) {
  await requireAdmin();
  await connection();
  const sp = await searchParams;
  const tab = sp.tab === "locks" ? "locks" : "requests";
  const pendingCount = await pendingEditRequestCount();
  const tabClass = (t: string) =>
    `-mb-px border-b-2 px-3 py-2 text-sm ${tab === t ? "border-indigo-600 font-medium text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-700"}`;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Allow Editing</h1>
        <p className="text-sm text-slate-500">
          Review edit requests from department heads, or reopen a cycle a department head has already saved.
        </p>
      </div>
      <div className="flex gap-1 border-b border-slate-200">
        <Link href="/editing" className={tabClass("requests")}>
          Edit requests
          {pendingCount > 0 && (
            <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-xs font-medium text-white">{pendingCount}</span>
          )}
        </Link>
        <Link href="/editing?tab=locks" className={tabClass("locks")}>
          Locked week offs
        </Link>
      </div>
      {tab === "requests" ? (
        <EditRequests
          requests={(await listEditRequests()).map((r) => ({
            id: r.id,
            departmentLabel: departmentLabel(r.department),
            note: r.note,
            dates: r.dates.map(formatPrettyDate).join(", "),
            employee: r.employee_name ? `${r.employee_name} (${r.employee_code})` : null,
            status: r.status,
            adminNote: r.admin_note,
            requestedBy: r.requested_by_name,
            decidedBy: r.decided_by_name,
            createdAt: r.created_at,
            decidedAt: r.decided_at,
          }))}
        />
      ) : (
        <MonthLocks
          locks={(await listMonthLocks()).map((l) => ({
            department: l.department,
            month: l.month,
            lockedBy: l.locked_by_name,
            lockedAt: l.locked_at,
          }))}
        />
      )}
    </div>
  );
}
