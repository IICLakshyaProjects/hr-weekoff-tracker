"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { decideEditRequest } from "@/app/actions/month-lock";

export type RequestItem = {
  id: number;
  departmentLabel: string;
  note: string;
  dates: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  adminNote: string | null;
  requestedBy: string | null;
  decidedBy: string | null;
  createdAt: string;
  decidedAt: string | null;
};

export function EditRequests({ requests, editingOpenToday }: { requests: RequestItem[]; editingOpenToday: boolean }) {
  const router = useRouter();
  const [target, setTarget] = useState<{ item: RequestItem; approve: boolean } | null>(null);
  const [reply, setReply] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const open = requests.filter((r) => r.status === "PENDING");
  const done = requests.filter((r) => r.status !== "PENDING");

  function start(item: RequestItem, approve: boolean) {
    setTarget({ item, approve });
    setReply("");
    setError(null);
  }

  async function confirm() {
    if (!target) return;
    setPending(true);
    setError(null);
    try {
      const res = await decideEditRequest(target.item.id, target.approve, reply);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setMessage({ ok: true, text: res.message });
      setTarget(null);
      router.refresh();
    } catch {
      setError("Could not update the request. Please retry.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <h2 className="text-sm font-semibold">Pending requests</h2>
        <p className="mt-1 text-sm text-slate-500">
          Department heads ask to change specific dates of a week they have already saved. Allowing it opens only those dates; the rest of the week stays locked.
        </p>
        {!editingOpenToday && open.length > 0 && (
          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Today is outside the Monday–Wednesday window. Heads can only make changes after you also allow editing for today (Editing days tab).
          </p>
        )}
        {message && (
          <p className={`mt-3 rounded-md px-3 py-2 text-sm ${message.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{message.text}</p>
        )}
        {open.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No pending requests.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {open.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{r.departmentLabel}</div>
                  <div className="text-xs text-slate-500">
                    Requested {r.createdAt}{r.requestedBy ? ` by ${r.requestedBy}` : ""}
                  </div>
                  <div className="mt-1 text-xs">
                    Dates to change: <span className="font-medium text-slate-800">{r.dates}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap rounded-md bg-slate-50 px-3 py-2 text-slate-700">{r.note}</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="btn" onClick={() => start(r, false)}>Deny</button>
                  <button type="button" className="btn btn-primary" onClick={() => start(r, true)}>Allow</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {done.length > 0 && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold">Recent decisions</h2>
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {done.map((r) => (
              <li key={r.id} className="py-2">
                <div className="font-medium">
                  {r.departmentLabel}
                  <span className={`ml-2 rounded px-1.5 py-0.5 text-xs font-medium ${r.status === "APPROVED" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700"}`}>
                    {r.status === "APPROVED" ? "Allowed" : "Denied"}
                  </span>
                </div>
                <div className="text-xs text-slate-500">
                  {r.dates} · {r.requestedBy ?? "Unknown"}: {r.note}
                </div>
                <div className="text-xs text-slate-500">
                  {r.decidedBy ? `${r.decidedBy}, ` : ""}{r.decidedAt}{r.adminNote ? ` — ${r.adminNote}` : ""}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {target && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby="decide-title">
          <div className="card w-full max-w-md p-5">
            <h2 id="decide-title" className="text-lg font-semibold">{target.approve ? "Allow editing?" : "Deny request?"}</h2>
            <p className="mt-2 text-sm text-slate-600">
              {target.approve
                ? `${target.item.departmentLabel} will be able to change only ${target.item.dates}. Every other locked date stays locked.`
                : `${target.item.dates} stay locked for ${target.item.departmentLabel}.`}
            </p>
            <label className="label mt-4" htmlFor="decide-reply">Reply to head (optional)</label>
            <textarea
              id="decide-reply"
              className="input min-h-20"
              maxLength={500}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              autoFocus
            />
            {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn" disabled={pending} onClick={() => setTarget(null)}>Cancel</button>
              <button type="button" className="btn btn-primary" disabled={pending} onClick={confirm}>
                {pending ? "Saving…" : target.approve ? "Allow" : "Deny"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
