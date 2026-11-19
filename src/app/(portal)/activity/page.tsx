import { requireAdmin } from "@/lib/auth";
import { APP_TZ, db } from "@/lib/db";

export const instant = false;

const ACTION_LABEL: Record<string, string> = {
  EDIT_REQUESTED: "Edit requested",
  EDIT_REQUEST_APPROVED: "Edit request allowed",
  EDIT_REQUEST_REJECTED: "Edit request denied",
  EDIT_REQUEST_CLOSED: "Allowed dates locked again",
  MONTH_SUBMITTED: "Week saved & locked",
  MONTH_REOPENED: "Week reopened by admin",
  EDIT_DAY_ENABLED: "Editing allowed for a day",
  WEEKOFF_MARKED: "Week off marked",
  WEEKOFF_REMOVED: "Week off removed",
  WEEKOFF_CHANGED: "Week off date changed",
};

export default async function ActivityPage({ searchParams }: PageProps<"/activity">) {
  await requireAdmin();
  const sp = await searchParams;
  const onlyRequests = sp.filter === "requests";
  const rows = await (await db()).q<{ id: number; action: string; details: string | null; at: string; name: string | null; emp_code: string | null }>(
    `SELECT a.id, a.action, a.details, to_char(a.at AT TIME ZONE $1, 'DD-Mon-YYYY HH24:MI') AS at, e.name, e.emp_code
     FROM activity_log a LEFT JOIN employees e ON e.id = a.actor_id
     WHERE NOT $2::boolean OR a.action LIKE 'EDIT_REQUEST%' OR a.details LIKE '%(edit request #%'
     ORDER BY a.id DESC LIMIT 500`,
    [APP_TZ, onlyRequests],
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Activity log</h1>
        <p className="text-sm text-slate-500">Last 500 actions.</p>
      </div>
      <div className="flex gap-2 text-sm">
        <a href="/activity" className={`btn ${onlyRequests ? "" : "btn-primary"}`}>All</a>
        <a href="/activity?filter=requests" className={`btn ${onlyRequests ? "btn-primary" : ""}`}>Edit requests</a>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Who</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="whitespace-nowrap px-3 py-1.5 text-slate-500">{r.at}</td>
                <td className="px-3 py-1.5">{r.name ? `${r.name} (${r.emp_code})` : "—"}</td>
                <td className="px-3 py-1.5 text-xs" title={r.action}>{ACTION_LABEL[r.action] ?? r.action}</td>
                <td className="px-3 py-1.5 text-slate-600">{r.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
