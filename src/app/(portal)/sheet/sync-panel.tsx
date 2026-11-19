"use client";

import { useActionState } from "react";
import { syncSheetNow } from "@/app/actions/sheet";
import { ResultBox } from "@/app/(portal)/result-box";

export function SyncPanel({ configured, sheetUrl, tabs }: { configured: boolean; sheetUrl: string; tabs: number }) {
  const [state, action, pending] = useActionState(syncSheetNow, null);
  return (
    <div className="card p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="font-medium">Google Sheet: </span>
          {configured ? (
            <span className="text-green-700">connected · {tabs} tabs update when a week off is marked</span>
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
      <ResultBox state={state} />
    </div>
  );
}
