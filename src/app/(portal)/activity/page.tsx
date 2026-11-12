import { requireAdmin } from "@/lib/auth";
import { APP_TZ, db } from "@/lib/db";

export const instant = false;

export default async function ActivityPage() {
  await requireAdmin();
  const rows = await (await db()).q<{ id: number; action: string; details: string | null; at: string; name: string | null; emp_code: string | null }>(
    `SELECT a.id, a.action, a.details, to_char(a.at AT TIME ZONE $1, 'DD-Mon-YYYY HH24:MI') AS at, e.name, e.emp_code
     FROM activity_log a LEFT JOIN employees e ON e.id = a.actor_id
     ORDER BY a.id DESC LIMIT 500`,
    [APP_TZ],
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Activity log</h1>
        <p className="text-sm text-slate-500">Last 500 actions.</p>
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
                <td className="px-3 py-1.5 font-mono text-xs">{r.action}</td>
                <td className="px-3 py-1.5 text-slate-600">{r.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
