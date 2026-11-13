import Link from "next/link";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { formatPrettyDate, isScheduleEditDay, todayIso } from "@/lib/dates";
import { todayOverride } from "@/lib/edit-window";
import { listMonthLocks } from "@/lib/month-lock";
import { EditToday } from "../employees/edit-today";
import { MonthLocks } from "../employees/month-locks";

export const instant = false;

export default async function EditingPage({ searchParams }: PageProps<"/editing">) {
  await requireAdmin();
  await connection();
  const sp = await searchParams;
  const tab = sp.tab === "locks" ? "locks" : "days";
  const today = todayIso();
  const override = tab === "days" ? await todayOverride(today) : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Allow Editing</h1>
        <p className="text-sm text-slate-500">
          Open week-off updates for today, or reopen a cycle a department head has already saved.
        </p>
      </div>
      <div className="flex gap-1 border-b border-slate-200">
        <Link
          href="/editing"
          className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === "days" ? "border-indigo-600 font-medium text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
        >
          Editing days
        </Link>
        <Link
          href="/editing?tab=locks"
          className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === "locks" ? "border-indigo-600 font-medium text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
        >
          Locked week offs
        </Link>
      </div>
      {tab === "days" ? (
        <EditToday
          label={formatPrettyDate(today)}
          weekdayOpen={isScheduleEditDay(today)}
          enabledBy={override?.enabled_by_name ?? null}
          enabledAt={override?.enabled_at ?? null}
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
