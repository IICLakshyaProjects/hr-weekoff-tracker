import Link from "next/link";
import { connection } from "next/server";
import { requireUser, visibleEmployeeIds } from "@/lib/auth";
import { daysInMonth, MONTH_NAMES, parseMonth, shiftMonth, todayIso } from "@/lib/dates";
import { listDepartments } from "@/lib/employees";
import { buildSheetPage, SHEET_PAGE_SIZE } from "@/lib/sheet";
import { db } from "@/lib/db";
import { listTabTitles, sheetsConfigured } from "@/lib/gsheets";
import { SyncPanel } from "./sync-panel";

export const instant = false;

export default async function SheetPage({ searchParams }: PageProps<"/sheet">) {
  const user = await requireUser();
  await connection();
  const sp = await searchParams;
  const pick = (k: string) => (typeof sp[k] === "string" ? sp[k] : "");
  const today = todayIso();
  const { year, month } = parseMonth(pick("month") || undefined, new Date(`${today}T12:00:00`));
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const days = daysInMonth(year, month);
  const dept = user.role === "ADMIN" ? pick("dept").trim() : "";
  const requestedPage = Number(pick("page")) || 1;

  const ids = await visibleEmployeeIds(user);
  const { rows, total, page, pageSize } = await buildSheetPage({
    employeeIds: ids === null ? null : [...new Set([...ids, user.id])],
    department: dept || undefined,
    from: days[0].date,
    to: days[days.length - 1].date,
    page: requestedPage,
    pageSize: SHEET_PAGE_SIZE,
  });
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const departments = user.role === "ADMIN" ? await listDepartments() : [];

  let unmapped: string[] = [];
  let tabCount = 0;
  if (user.role === "ADMIN" && sheetsConfigured()) {
    const bus = await (await db()).q<{ bu: string }>(
      "SELECT DISTINCT business_unit AS bu FROM employees WHERE business_unit IS NOT NULL AND btrim(business_unit) <> '' AND role <> 'ADMIN' ORDER BY 1",
    );
    try {
      const titles = await listTabTitles();
      const known = new Set(titles.map((t) => t.trim().toLowerCase()));
      unmapped = bus.map((b) => b.bu).filter((b) => !known.has(b.trim().toLowerCase()));
      tabCount = bus.length - unmapped.length;
    } catch {
      unmapped = [];
    }
  }
  const sheetUrl = process.env.GOOGLE_SHEET_ID ? `https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SHEET_ID}/edit` : "";
  const href = (nextPage: number, nextMonth = monthStr) => {
    const q = new URLSearchParams({ month: nextMonth });
    if (dept) q.set("dept", dept);
    if (nextPage > 1) q.set("page", String(nextPage));
    return `/sheet?${q}`;
  };
  const downloadQuery = new URLSearchParams({ month: monthStr, ...(dept && { dept }) });

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
          <Link className="btn" href={href(1, shiftMonth(year, month, -1))}>‹ Prev</Link>
          <div className="min-w-36 text-center font-medium">
            {MONTH_NAMES[month - 1]} {year}
          </div>
          <Link className="btn" href={href(1, shiftMonth(year, month, 1))}>Next ›</Link>
          <a download className="btn btn-primary" href={`/api/export/sheet?${downloadQuery}`}>Download month</a>
          <a download className="btn" href="/api/export/sheet">Download all</a>
        </div>
      </div>

      {user.role === "ADMIN" && (
        <form className="card flex flex-wrap items-end gap-3 p-3" action="/sheet">
          <input type="hidden" name="month" value={monthStr} />
          <div className="w-72">
            <label className="label">Department</label>
            <select className="input" name="dept" defaultValue={dept}>
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <button className="btn btn-primary">Filter</button>
          {dept && <Link className="btn" href={`/sheet?month=${monthStr}`}>Clear</Link>}
        </form>
      )}

      {user.role === "ADMIN" && (
        <SyncPanel configured={sheetsConfigured()} sheetUrl={sheetUrl} tabs={tabCount} unmapped={unmapped} />
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {["Emp ID", "Associate Name", "Designation", "Business Unit", "Department", "Date of Request", "Week off Date - 1", "Week off Date - 2"].map((h) => (
                <th key={h} className="whitespace-nowrap px-3 py-2">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                  {dept ? `No week offs for ${dept} in this month.` : "No week offs marked for this month."}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={`${r.empId}|${r.weekStart}`} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium">{r.empId}</td>
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2 text-slate-600">{r.designation || "—"}</td>
                <td className="px-3 py-2 text-slate-600">{r.businessUnit || "—"}</td>
                <td className="px-3 py-2 text-slate-600">{r.department || "—"}</td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-600">{r.requestDate}</td>
                <td className={`whitespace-nowrap px-3 py-2 ${r.wo1 === "Working" ? "text-slate-400" : ""}`}>{r.wo1}</td>
                <td className="whitespace-nowrap px-3 py-2">{r.wo2}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SheetPager page={page} pageCount={pageCount} total={total} pageSize={pageSize} href={href} />
    </div>
  );
}

function pageWindow(page: number, pageCount: number): number[] {
  const start = Math.max(1, Math.min(page - 2, pageCount - 4));
  const end = Math.min(pageCount, Math.max(page + 2, start + 4));
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

function SheetPager({
  page,
  pageCount,
  total,
  pageSize,
  href,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  href: (page: number) => string;
}) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const pages = pageWindow(page, pageCount);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className="text-slate-500">
        Showing {from}–{to} of {total}
      </p>
      <div className="flex flex-wrap items-center gap-1">
        <Link className={`btn ${page <= 1 ? "pointer-events-none opacity-40" : ""}`} href={href(page - 1)} aria-disabled={page <= 1}>
          Previous
        </Link>
        {pages[0] > 1 && <span className="px-1 text-slate-400">…</span>}
        {pages.map((n) => (
          <Link key={n} className={`btn min-w-9 ${n === page ? "btn-primary" : ""}`} href={href(n)} aria-current={n === page ? "page" : undefined}>
            {n}
          </Link>
        ))}
        {pages[pages.length - 1] < pageCount && <span className="px-1 text-slate-400">…</span>}
        <Link className={`btn ${page >= pageCount ? "pointer-events-none opacity-40" : ""}`} href={href(page + 1)} aria-disabled={page >= pageCount}>
          Next
        </Link>
      </div>
    </div>
  );
}
