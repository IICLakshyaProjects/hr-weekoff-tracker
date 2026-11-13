import { getCurrentUser } from "@/lib/auth";
import { getEmployee, listEmployees } from "@/lib/employees";
import { db } from "@/lib/db";
import { daysFrom, daysInMonth, isIsoDate, parseMonth } from "@/lib/dates";
import { toCsv } from "@/lib/csv";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  const { year, month } = parseMonth(url.searchParams.get("month") ?? undefined, new Date());
  const dept = url.searchParams.get("dept") || undefined;
  const q = url.searchParams.get("q") || undefined;
  const ranged = isIsoDate(from) && isIsoDate(to) && from <= to;
  const span = ranged ? Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86400000) + 1 : 0;
  const days = ranged && span > 0 && span <= 62 ? daysFrom(from, span) : daysInMonth(year, month);

  let employees = await listEmployees(user, { department: dept, q, status: "ACTIVE" });
  if (user.role !== "ADMIN" && !employees.some((e) => e.id === user.id)) {
    const self = await getEmployee(user.id);
    if (self && (!dept || self.department === dept)) employees = [self, ...employees];
  }
  const ids = employees.map((e) => e.id);
  const marks = new Set(
    ids.length
      ? (
          (await (await db()).q<{ employee_id: number; date: string }>(`SELECT employee_id, date FROM weekoffs WHERE date BETWEEN $1 AND $2 AND employee_id = ANY($3::int[])`, [days[0].date, days[days.length - 1].date, ids]))
        ).map((r) => `${r.employee_id}|${r.date}`)
      : [],
  );

  const header = ["Employee ID", "Name", "Department", "Reporting Head", ...days.map((d) => `${d.date} ${d.weekday}`), "Total Week Offs"];
  const body = employees.map((e) => {
    const cells = days.map((d) => (marks.has(`${e.id}|${d.date}`) ? "WO" : ""));
    return [e.emp_code, e.name, e.department, e.manager_name, ...cells, cells.filter(Boolean).length];
  });

  const ym = ranged ? `${from}` : `${year}-${String(month).padStart(2, "0")}`;
  return new Response("﻿" + toCsv([header, ...body]), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="weekoffs-${ym}.csv"`,
    },
  });
}
