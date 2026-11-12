"use client";

import { useState } from "react";
import { toggleWeekoff } from "@/app/actions/weekoffs";
import type { Day } from "@/lib/dates";

export type GridRow = {
  id: number;
  emp_code: string;
  name: string;
  department: string | null;
  default_weekoff: string | null;
  editable: boolean;
  locked: boolean;
};

export function WeekoffGrid({
  days,
  rows,
  initialMarks,
  today,
}: {
  today: string;
  days: Day[];
  rows: GridRow[];
  initialMarks: string[];
}) {
  const [marks, setMarks] = useState(() => new Set(initialMarks));
  // Re-sync when the server sends fresh data (e.g. after a CSV import).
  const [prevInitial, setPrevInitial] = useState(initialMarks);
  if (prevInitial !== initialMarks) {
    setPrevInitial(initialMarks);
    setMarks(new Set(initialMarks));
  }
  // Cells currently saving. Other cells stay clickable while one saves.
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function toggle(row: GridRow, date: string) {
    const key = `${row.id}|${date}`;
    if (!row.editable || date < today || busy.has(key)) return;
    const wasMarked = marks.has(key);
    // Optimistic update
    setMarks((prev) => {
      const next = new Set(prev);
      if (wasMarked) next.delete(key);
      else next.add(key);
      return next;
    });
    setBusy((prev) => new Set(prev).add(key));
    toggleWeekoff(row.id, date)
      .then((res) => {
        if (!res.ok) {
          setMessage({ ok: false, text: res.message });
          setMarks((prev) => {
            const next = new Set(prev);
            if (wasMarked) next.add(key);
            else next.delete(key);
            return next;
          });
        }
      })
      .catch(() => setMessage({ ok: false, text: "Could not save. Please retry." }))
      .finally(() =>
        setBusy((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        }),
      );
  }

  const perDay = days.map((d) => rows.reduce((n, r) => n + (marks.has(`${r.id}|${d.date}`) ? 1 : 0), 0));

  if (rows.length === 0) {
    return <div className="card p-8 text-center text-sm text-slate-500">No employees to show.</div>;
  }

  return (
    <div className="space-y-3">
      {message && (
        <div className={`rounded-md px-3 py-2 text-sm ${message.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
          {message.text}
          <button className="ml-3 underline" onClick={() => setMessage(null)}>dismiss</button>
        </div>
      )}

      <div className="card overflow-auto">
        <table className="border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50">
              <th className="sticky left-0 z-20 min-w-60 border-b border-r border-slate-200 bg-slate-50 px-3 py-2 text-left">
                Employee
              </th>
              {days.map((d) => (
                <th
                  key={d.date}
                  className={`w-8 min-w-8 border-b border-slate-200 px-0 py-1 text-center font-medium ${
                    d.weekday === "SUN" || d.weekday === "SAT" ? "bg-amber-50 text-amber-800" : "text-slate-600"
                  } ${d.date === today ? "ring-2 ring-inset ring-indigo-400" : ""}`}
                >
                  <div>{d.day}</div>
                  <div className="text-[10px] font-normal">{d.weekday.slice(0, 2)}</div>
                </th>
              ))}
              <th className="border-b border-l border-slate-200 px-2 py-2 text-center">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const total = days.reduce((n, d) => n + (marks.has(`${r.id}|${d.date}`) ? 1 : 0), 0);
              return (
                <tr key={r.id} className="hover:bg-slate-50/60">
                  <td className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-3 py-1.5">
                      <span>
                        <span className="block text-sm font-medium text-slate-800">{r.name}</span>
                        <span className="text-slate-500">
                          {r.emp_code}
                          {r.department ? ` · ${r.department}` : ""}
                          {r.default_weekoff ? ` · default ${r.default_weekoff}` : ""}
                          {r.locked ? " · locked" : !r.editable ? " · view only" : ""}
                        </span>
                      </span>
                  </td>
                  {days.map((d) => {
                    const key = `${r.id}|${d.date}`;
                    const on = marks.has(key);
                    const past = d.date < today;
                    const canToggle = r.editable && !past;
                    return (
                      <td key={d.date} className="border-b border-slate-100 p-0.5 text-center">
                        <button
                          type="button"
                          disabled={!canToggle}
                          onClick={() => toggle(r, d.date)}
                          title={past ? `${r.name} – ${d.date} (past dates cannot be changed)` : `${r.name} – ${d.date}${on ? " (week off)" : ""}`}
                          className={`h-7 w-7 rounded text-[10px] font-semibold transition ${
                            on
                              ? "bg-emerald-500 text-white"
                              : d.weekday === "SUN" || d.weekday === "SAT"
                                ? "bg-amber-50"
                                : "bg-slate-50"
                          } ${canToggle ? "cursor-pointer hover:ring-2 hover:ring-indigo-300" : "cursor-default"} ${
                            past ? "opacity-40" : ""
                          } ${busy.has(key) ? "animate-pulse opacity-60" : ""}`}
                        >
                          {on ? "WO" : ""}
                        </button>
                      </td>
                    );
                  })}
                  <td className="border-b border-l border-slate-200 px-2 text-center text-sm font-semibold">{total}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 text-slate-600">
              <td className="sticky left-0 z-10 border-r border-slate-200 bg-slate-50 px-3 py-1.5 font-medium">Off on this day</td>
              {perDay.map((n, i) => (
                <td key={days[i].date} className="text-center">{n || ""}</td>
              ))}
              <td className="border-l border-slate-200 text-center font-semibold">{perDay.reduce((a, b) => a + b, 0)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="flex gap-4 text-xs text-slate-500">
        <span><span className="mr-1 inline-block h-3 w-3 rounded bg-emerald-500 align-middle" />Week off</span>
        <span><span className="mr-1 inline-block h-3 w-3 rounded bg-amber-50 align-middle ring-1 ring-amber-200" />Weekend</span>
      </div>
    </div>
  );
}
