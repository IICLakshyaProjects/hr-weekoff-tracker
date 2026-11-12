import { getCurrentUser, visibleEmployeeIds } from "@/lib/auth";
import { daysInMonth, parseMonth } from "@/lib/dates";
import { buildSheetRows, sheetCsv } from "@/lib/sheet";

/** Week Off Sheet download. ?month=YYYY-MM for one month, no parameter for everything. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const monthParam = url.searchParams.get("month");
  const department = url.searchParams.get("dept")?.trim() || undefined;
  let range: { from?: string; to?: string } = {};
  let name = "WeekOff-Sheet";
  if (monthParam) {
    const { year, month } = parseMonth(monthParam, new Date());
    const days = daysInMonth(year, month);
    range = { from: days[0].date, to: days[days.length - 1].date };
    name += `-${year}-${String(month).padStart(2, "0")}`;
  }
  if (department) name += `-${department.replace(/[^\w]+/g, "_")}`;
  const ids = await visibleEmployeeIds(user);
  const rows = await buildSheetRows({
    employeeIds: ids === null ? null : [...new Set([...ids, user.id])],
    department,
    ...range,
  });

  return new Response(sheetCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}.csv"`,
    },
  });
}
