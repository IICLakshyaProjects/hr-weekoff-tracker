"use client";

import { useActionState } from "react";
import { syncSheetNow } from "@/app/actions/sheet";
import { ResultBox } from "@/app/(portal)/result-box";

export function SyncPanel({ configured, sheetUrl, tabs, unmapped }: { configured: boolean; sheetUrl: string; tabs: number; unmapped: string[] }) {
  const [state, action, pending] = useActionState(syncSheetNow, null);
  return (
    <div className="card p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="font-medium">Google Sheet: </span>
          {configured ? (
            <span className="text-green-700">connected · {tabs} department tabs update automatically on every change</span>
          ) : (
            <span className="text-amber-700">not configured — week offs are saved in the database only</span>
          )}
          {sheetUrl && (
            <a className="ml-2 text-indigo-600 underline" href={sheetUrl} target="_blank" rel="noreferrer">open sheet</a>
          )}
        </div>
        <form action={action}>
          <button className="btn" disabled={pending || !configured}>{pending ? "Syncing…" : "Sync all tabs now"}</button>
        </form>
      </div>
      {unmapped.length > 0 && (
        <p className="mt-2 text-xs text-slate-500">No sheet tab for business unit(s): {unmapped.join(", ")} — their week offs are kept in the database only.</p>
      )}
      <ResultBox state={state} />
    </div>
  );
}
