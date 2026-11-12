"use client";

import { useActionState, useState } from "react";
import { importEmployees } from "@/app/actions/employees";
import { parseCsv } from "@/lib/csv";
import { ResultBox } from "@/app/(portal)/result-box";

export function ImportForm() {
  const [state, action, pending] = useActionState(importEmployees, null);
  const [preview, setPreview] = useState<string[][] | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setPreview(file ? parseCsv(await file.text()).slice(0, 11) : null);
  }

  return (
    <div className="card space-y-4 p-4">
      <form action={action} className="space-y-4">
        <div>
          <label className="label">CSV file</label>
          <input type="file" name="file" accept=".csv,text/csv" onChange={onFile} className="text-sm" />
        </div>
        <details>
          <summary className="cursor-pointer text-sm text-slate-600">…or paste CSV / rows copied from Excel (with the header row)</summary>
          <textarea className="input mt-2 h-40 font-mono text-xs" name="csv" placeholder="Employee Number,Full Name,Email,Job Title,..." />
        </details>
        <button className="btn btn-primary" disabled={pending}>{pending ? "Importing…" : "Import employees"}</button>
      </form>

      {preview && preview.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-medium">Preview (first {preview.length - 1} rows)</h3>
          <div className="overflow-x-auto rounded border border-slate-200">
            <table className="text-xs">
              <thead className="bg-slate-50">
                <tr>{preview[0].map((h, i) => <th key={i} className="px-2 py-1 text-left">{h}</th>)}</tr>
              </thead>
              <tbody>
                {preview.slice(1).map((r, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    {r.map((c, j) => <td key={j} className="whitespace-nowrap px-2 py-1">{/password/i.test(preview[0][j] ?? "") && c ? "••••••" : c}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ResultBox state={state} />
    </div>
  );
}
