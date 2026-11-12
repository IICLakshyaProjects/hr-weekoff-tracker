"use client";

import { useActionState } from "react";
import { importWeekoffs } from "@/app/actions/weekoffs";
import { ResultBox } from "@/app/(portal)/result-box";

export function WeekoffImport() {
  const [state, action, pending] = useActionState(importWeekoffs, null);
  return (
    <details className="card p-4">
      <summary className="cursor-pointer text-sm font-medium">Bulk upload week offs (CSV)</summary>
      <p className="mt-2 text-sm text-slate-500">
        Columns: <code>employee_id, date, action, note</code> — date as <code>YYYY-MM-DD</code>, action is <code>ADD</code> (default) or{" "}
        <code>REMOVE</code>.{" "}
        <a download className="text-indigo-600 underline" href="/api/template/weekoffs">Download template</a>
      </p>
      <form action={action} className="mt-3 flex flex-wrap items-center gap-3">
        <input type="file" name="file" accept=".csv,text/csv" required className="text-sm" />
        <button className="btn btn-primary" disabled={pending}>{pending ? "Uploading…" : "Upload"}</button>
      </form>
      <ResultBox state={state} />
    </details>
  );
}
