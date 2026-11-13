import { redirect } from "next/navigation";
import { connection } from "next/server";
import { canEditWeekoff, requireUser } from "@/lib/auth";
import { getEmployee, listEmployees } from "@/lib/employees";
import { db } from "@/lib/db";
import { MONTH_NAMES, cycleStart, daysInMonth, formatCycleRange, formatPrettyDate, isScheduleEditDay, markingWednesday, parseMonth, todayIso } from "@/lib/dates";
import { departmentKey, departmentLabel } from "@/lib/department";
import { isEditingOpen } from "@/lib/edit-window";
import { dateIsLocked, locksForDates } from "@/lib/month-lock";
import { WeekoffGrid, type GridRow } from "./weekoff-grid";
import { WeekoffImport } from "./weekoff-import";
import { SubmitMonth } from "./submit-month";

export const instant = false;

export default async function WeekoffsPage({ searchParams }: PageProps<"/weekoffs">) {
  const user = await requireUser();
  if (user.role === "ADMIN") redirect("/employees");
  const sp = await searchParams;
  const pick = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);

  await connection();
  const todayStr = todayIso();
  const currentStart = cycleStart(todayStr);
  const { year, month } = parseMonth(pick("month"), new Date(`${todayStr}T12:00:00`));
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const markThrough = markingWednesday(todayStr);
  const days = daysInMonth(year, month).filter((d) => d.date <= markThrough);
  const cycleLabel = formatCycleRange(currentStart);
  const dept = pick("dept") ?? "";
  const q = pick("q") ?? "";
  const editingOpen = await isEditingOpen(todayStr);
  const weekdayOpen = isScheduleEditDay(todayStr);

  let employees = await listEmployees(user, { department: dept || undefined, q: q || undefined, status: "ACTIVE" });
  if (!employees.some((e) => e.id === user.id)) {
    const self = await getEmployee(user.id);
    if (self && (!dept || self.department === dept)) employees = [self, ...employees];
  }

  const ids = employees.map((e) => e.id);
  const marks: string[] = ids.length && days.length
    ? (
        (await (await db()).q<{ employee_id: number; date: string }>(
          `SELECT employee_id, date FROM weekoffs WHERE date BETWEEN $1 AND $2 AND employee_id = ANY($3::int[])`,
          [days[0].date, days[days.length - 1].date, ids],
        ))
      ).map((r) => `${r.employee_id}|${r.date}`)
    : [];

  const locks = await locksForDates(days.map((d) => d.date));
  const editable = new Map(await Promise.all(employees.map(async (e) => [e.id, await canEditWeekoff(user, e.id)] as const)));
  const rows: GridRow[] = employees.map((e) => {
    const key = departmentKey(e.department);
    const lockedDates = days.filter((d) => dateIsLocked(key, d.date, locks)).map((d) => d.date);
    return {
      id: e.id,
      emp_code: e.emp_code,
      name: e.name,
      department: e.department,
      default_weekoff: e.default_weekoff,
      locked: lockedDates.length === days.length,
      lockedDates,
      editable: editable.get(e.id) ?? false,
    };
  });
  const submittable = new Map<string, string>();
  for (const e of employees) {
    if (!(editable.get(e.id) ?? false)) continue;
    const key = departmentKey(e.department);
    const blocked = locks.some((l) => {
      if (l.department !== key) return false;
      if (/^\d{4}-\d{2}$/.test(l.month)) return days.some((d) => d.date.slice(0, 7) === l.month);
      return l.month === currentStart;
    });
    if (!blocked) submittable.set(key, departmentLabel(key));
  }
  const openDepartments = [...submittable.entries()].map(([key, label]) => ({ key, label }));
  const lockedLabels = [...new Set(rows.filter((r) => r.lockedDates.length > 0).map((r) => departmentLabel(departmentKey(r.department))))];
  const departments = [...new Set(employees.map((e) => e.department).filter(Boolean) as string[])];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Week Off Tracker</h1>
          <p className="text-sm text-slate-500">
            {user.role === "HEAD" ? "Employees mapped under you" : "Your week offs"}
            {editingOpen
              ? ` · dates through ${formatPrettyDate(markThrough)}. Up to 2 week offs in a Monday–Sunday week.`
              : ` · dates through ${formatPrettyDate(markThrough)}. Updates are open Monday to Wednesday.`}
          </p>
        </div>
        <div className="min-w-36 text-center font-medium">
          {MONTH_NAMES[month - 1]} {year}
        </div>
      </div>

      <div className="card flex flex-wrap items-end gap-3 p-3">
        <form className="flex flex-wrap items-end gap-3" action="/weekoffs">
          <div className="w-56">
            <label className="label">Search</label>
            <input className="input" name="q" defaultValue={q} placeholder="Name, ID or email" />
          </div>
          <div className="w-48">
            <label className="label">Department</label>
            <select className="input" name="dept" defaultValue={dept}>
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </div>
          <div className="w-40">
            <label className="label">Month</label>
            <input className="input" type="month" name="month" defaultValue={monthStr} />
          </div>
          <button className="btn">Filter</button>
        </form>
        {user.role === "HEAD" && editingOpen && openDepartments.length > 0 && (
          <SubmitMonth month={currentStart} monthLabel={cycleLabel} departments={openDepartments} />
        )}
        {days.length > 0 && (
          <a
            className="btn ml-auto"
            href={`/api/export/weekoffs?${new URLSearchParams({ from: days[0].date, to: days[days.length - 1].date, ...(dept && { dept }), ...(q && { q }) })}`}
          >
            Export CSV
          </a>
        )}
      </div>

      {!editingOpen && (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Week offs can be changed on Monday, Tuesday, and Wednesday only. The other days stay closed unless an admin allows editing for that day.
        </div>
      )}
      {editingOpen && !weekdayOpen && (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          An admin has allowed editing for today. You can correct this cycle, including days that have already passed.
        </div>
      )}
      {lockedLabels.length > 0 && (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Some days in these weeks are locked for {lockedLabels.join(", ")}. An admin must allow editing before those days can be changed.
        </div>
      )}

      {days.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">
          Nothing to show for {MONTH_NAMES[month - 1]} {year} yet. Marking is open through {formatPrettyDate(markThrough)}.
        </div>
      ) : (
        <WeekoffGrid key={`${monthStr}|${dept}|${q}|${editingOpen}`} days={days} rows={rows} initialMarks={marks} today={todayStr} editingOpen={editingOpen} currentStart={currentStart} />
      )}

      {user.can_edit_weekoff && <WeekoffImport editingOpen={editingOpen} />}
    </div>
  );
}
