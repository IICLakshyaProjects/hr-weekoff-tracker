import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { canEditWeekoff, requireUser } from "@/lib/auth";
import { getEmployee, listEmployees } from "@/lib/employees";
import { db } from "@/lib/db";
import { daysInMonth, MONTH_NAMES, parseMonth, shiftMonth } from "@/lib/dates";
import { WeekoffGrid, type GridRow } from "./weekoff-grid";
import { WeekoffImport } from "./weekoff-import";

export default async function WeekoffsPage({ searchParams }: PageProps<"/weekoffs">) {
  const user = await requireUser();
  if (user.role === "ADMIN") redirect("/employees");
  const sp = await searchParams;
  const pick = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);

  await connection(); // "today" must be computed per request
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const { year, month } = parseMonth(pick("month"), now);
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const days = daysInMonth(year, month);
  const dept = pick("dept") ?? "";
  const q = pick("q") ?? "";

  let employees = await listEmployees(user, { department: dept || undefined, q: q || undefined, status: "ACTIVE" });
  // Heads and employees also see their own row (editable only if permitted).
  if (!employees.some((e) => e.id === user.id)) {
    const self = await getEmployee(user.id);
    if (self && (!dept || self.department === dept)) employees = [self, ...employees];
  }

  const ids = employees.map((e) => e.id);
  const marks: string[] = ids.length
    ? (
        (await (await db()).q<{ employee_id: number; date: string }>(`SELECT employee_id, date FROM weekoffs WHERE date BETWEEN $1 AND $2 AND employee_id = ANY($3::int[])`, [days[0].date, days[days.length - 1].date, ids]))
      ).map((r) => `${r.employee_id}|${r.date}`)
    : [];

  const editable = new Map(await Promise.all(employees.map(async (e) => [e.id, await canEditWeekoff(user, e.id)] as const)));
  const rows: GridRow[] = employees.map((e) => ({
    id: e.id,
    emp_code: e.emp_code,
    name: e.name,
    department: e.department,
    default_weekoff: e.default_weekoff,
    editable: editable.get(e.id) ?? false,
  }));
  const departments = [...new Set(employees.map((e) => e.department).filter(Boolean) as string[])];
  const qs = (m: string) => `/weekoffs?${new URLSearchParams({ month: m, ...(dept && { dept }), ...(q && { q }) })}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Week Off Tracker</h1>
          <p className="text-sm text-slate-500">
            {user.role === "HEAD" ? "Employees mapped under you" : "Your week offs"}
            {rows.some((r) => r.editable) ? " · click a day to mark / unmark a week off" : " · view only"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link className="btn" href={qs(shiftMonth(year, month, -1))}>‹ Prev</Link>
          <div className="min-w-36 text-center font-medium">
            {MONTH_NAMES[month - 1]} {year}
          </div>
          <Link className="btn" href={qs(shiftMonth(year, month, 1))}>Next ›</Link>
        </div>
      </div>

      <form className="card flex flex-wrap items-end gap-3 p-3" action="/weekoffs">
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
        <button className="btn btn-primary">Apply</button>
        <a className="btn ml-auto" href={`/api/export/weekoffs?${new URLSearchParams({ month: monthStr, ...(dept && { dept }), ...(q && { q }) })}`}>
          Export CSV
        </a>
      </form>

      <WeekoffGrid key={`${monthStr}|${dept}|${q}`} days={days} rows={rows} initialMarks={marks} today={todayStr} />

      {user.can_edit_weekoff && <WeekoffImport />}
    </div>
  );
}
