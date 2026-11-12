import Link from "next/link";
import { connection } from "next/server";
import { requireUser, visibleEmployeeIds } from "@/lib/auth";
import { daysInMonth, MONTH_NAMES, parseMonth, shiftMonth } from "@/lib/dates";
import { buildSheetRows, SHEET_HEADER } from "@/lib/sheet";
import { db } from "@/lib/db";
import { SHEET_TABS, sheetsConfigured } from "@/lib/gsheets";
import { SyncPanel } from "./sync-panel";

export default async function SheetPage({ searchParams }: PageProps<"/sheet">) {
  const user = await requireUser();
  await connection();
  const sp = await searchParams;
  const { year, month } = parseMonth(typeof sp.month === "string" ? sp.month : undefined, new Date());
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const days = daysInMonth(year, month);

  const ids = await visibleEmployeeIds(user);
  const rows = await buildSheetRows({
    employeeIds: ids === null ? null : [...new Set([...ids, user.id])],
    from: days[0].date,
    to: days[days.length - 1].date,
  });

  let unmapped: string[] = [];
  if (user.role === "ADMIN") {
    const bus = await (await db()).q<{ bu: string }>(
      "SELECT DISTINCT business_unit AS bu FROM employees WHERE business_unit IS NOT NULL AND role <> 'ADMIN' ORDER BY 1",
    );
    unmapped = bus.map((b) => b.bu).filter((b) => !(b in SHEET_TABS));
  }
  const sheetUrl = process.env.GOOGLE_SHEET_ID ? `https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SHEET_ID}/edit` : "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Week Off Sheet</h1>
          <p className="text-sm text-slate-500">
            One row per employee per week (Mon–Sun). One week off in a week → Date - 1 shows <b>Working</b>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link className="btn" href={`/sheet?month=${shiftMonth(year, month, -1)}`}>‹ Prev</Link>
          <div className="min-w-36 text-center font-medium">
            {MONTH_NAMES[month - 1]} {year}
          </div>
          <Link className="btn" href={`/sheet?month=${shiftMonth(year, month, 1)}`}>Next ›</Link>
          <a download className="btn btn-primary" href={`/api/export/sheet?month=${monthStr}`}>Download month</a>
          <a download className="btn" href="/api/export/sheet">Download all</a>
        </div>
      </div>

      {user.role === "ADMIN" && (
        <SyncPanel configured={sheetsConfigured()} sheetUrl={sheetUrl} tabs={Object.keys(SHEET_TABS).length} unmapped={unmapped} />
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {SHEET_HEADER.map((h) => (
                <th key={h} className="whitespace-nowrap px-3 py-2">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-slate-500">No week offs marked for this month.</td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={`${r.empId}|${r.weekStart}`} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium">{r.empId}</td>
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2 text-slate-600">{r.designation || "—"}</td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-600">{r.requestDate}</td>
                <td className={`whitespace-nowrap px-3 py-2 ${r.wo1 === "Working" ? "text-slate-400" : ""}`}>{r.wo1}</td>
                <td className="whitespace-nowrap px-3 py-2">{r.wo2}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
