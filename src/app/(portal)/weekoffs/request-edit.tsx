"use client";

import { createContext, useContext, useState } from "react";
import { useRouter } from "next/navigation";
import { finishEditRequest, requestEdit } from "@/app/actions/month-lock";
import { formatPrettyDate } from "@/lib/dates";

/** Locked dates a head can ask to change, per department. */
export type RequestableDepartment = {
  key: string;
  label: string;
  dates: { date: string; label: string }[];
};

export type RequestView = {
  id: number;
  departmentLabel: string;
  /** Set for a request about one employee's date; null for a bulk request. */
  employee: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  note: string;
  dates: string[];
  /** Approved and the head has not locked the dates again yet. */
  open: boolean;
  adminNote: string | null;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
};

type Ctx = {
  /** Opens the request popup for one employee's locked date. */
  requestDate: (department: string, date: string, employeeId: number, employeeName: string) => void;
  /** Pending/open state of a request covering this employee's date (their own or a bulk one). */
  stateFor: (department: string, date: string, employeeId: number) => "pending" | "open" | undefined;
};

const RequestEditContext = createContext<Ctx | null>(null);

export function useRequestEdit(): Ctx | null {
  return useContext(RequestEditContext);
}

export function RequestEditProvider({
  departments,
  requests,
  requested,
  children,
}: {
  departments: RequestableDepartment[];
  requests: RequestView[];
  requested: [string, "pending" | "open"][];
  children: React.ReactNode;
}) {
  const router = useRouter();
  // A clicked cell asks for that one date; the bulk button asks for every saved date of the department.
  const [dialog, setDialog] = useState<{
    department: string;
    date: string | null;
    employee: { id: number; name: string } | null;
  } | null>(null);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [finishing, setFinishing] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const requestedMap = new Map(requested);
  const totalDates = departments.reduce((n, d) => n + d.dates.length, 0);

  function open(department: string, date: string | null, employee: { id: number; name: string } | null = null) {
    setDialog({ department, date, employee });
    setNote("");
    setError(null);
  }

  const ctx: Ctx = {
    stateFor: (department, date, employeeId) =>
      requestedMap.get(`${department}|${date}|${employeeId}`) ?? requestedMap.get(`${department}|${date}`),
    requestDate(department, date, employeeId, employeeName) {
      open(department, date, { id: employeeId, name: employeeName });
    },
  };

  const current = dialog ? departments.find((d) => d.key === dialog.department) : undefined;
  const bulkDepartments = departments.filter((d) => d.dates.length);

  async function send() {
    if (!dialog) return;
    const dates = dialog.date ? [dialog.date] : (current?.dates.map((d) => d.date) ?? []);
    if (!note.trim()) {
      setError("Describe the changes you need.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await requestEdit(dialog.department, dates, note, dialog.employee?.id);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setMessage({ ok: true, text: res.message });
      setDialog(null);
      router.refresh();
    } catch {
      setError("Could not send the request. Please retry.");
    } finally {
      setPending(false);
    }
  }

  async function finish(id: number) {
    if (!window.confirm("Lock these dates again? You will need a new request to change them later.")) return;
    setFinishing(id);
    setMessage(null);
    try {
      const res = await finishEditRequest(id);
      setMessage({ ok: res.ok, text: res.message });
      if (res.ok) router.refresh();
    } catch {
      setMessage({ ok: false, text: "Could not lock the dates. Please retry." });
    } finally {
      setFinishing(null);
    }
  }

  const showPanel = totalDates > 0 || requests.length > 0;

  return (
    <RequestEditContext.Provider value={ctx}>
      {showPanel && (
        <div className="card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Saved week offs</h2>
              <p className="mt-1 text-sm text-slate-500">
                Saved dates are locked. Click a locked date to request that day, or use Request edit to ask for edit access with a note.
              </p>
            </div>
            {totalDates > 0 && (
              <button type="button" className="btn" onClick={() => open(bulkDepartments[0].key, null)}>
                Request edit
              </button>
            )}
          </div>
          {message && (
            <p className={`mt-3 rounded-md px-3 py-2 text-sm ${message.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{message.text}</p>
          )}
          {requests.length > 0 && (
            <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100 text-sm">
              {requests.map((r) => (
                <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">
                      {r.employee ? `${r.employee} · ${r.dates[0]}` : `${r.departmentLabel} · bulk request`}
                      <StatusBadge status={r.status} open={r.open} />
                    </div>
                    <div className="mt-1 space-y-0.5 text-xs text-slate-500">
                      <div>
                        Your note ({r.createdAt}): <span className="text-slate-700">{r.note}</span>
                      </div>
                      {r.status !== "PENDING" && (
                        <div>
                          {r.status === "APPROVED" ? "Allowed" : "Denied"}
                          {r.decidedBy ? ` by ${r.decidedBy}` : ""}
                          {r.decidedAt ? ` on ${r.decidedAt}` : ""}
                          {r.adminNote && (
                            <>
                              : <span className="text-slate-700">{r.adminNote}</span>
                            </>
                          )}
                        </div>
                      )}
                      {r.open && (
                        <div className="text-green-700">
                          {r.employee ? "You can change this date now." : "You can change the saved week offs now."} Click Save &amp; lock when you are done.
                        </div>
                      )}
                    </div>
                  </div>
                  {r.open && (
                    <button type="button" className="btn btn-primary" disabled={finishing === r.id} onClick={() => finish(r.id)}>
                      {finishing === r.id ? "Saving…" : "Save & lock"}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {children}

      {dialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby="request-edit-title">
          <div className="card w-full max-w-md p-5">
            <h2 id="request-edit-title" className="text-lg font-semibold">Request edit access</h2>
            <p className="mt-1 text-sm text-slate-600">
              {dialog.employee && dialog.date
                ? `For ${dialog.employee.name} on ${formatPrettyDate(dialog.date)}. `
                : "For the saved week offs you need to change. "}
              The admin will allow or deny it.
            </p>
            {!dialog.date && bulkDepartments.length > 1 && (
              <div className="mt-3">
                <label className="label" htmlFor="request-edit-dept">Department</label>
                <select
                  id="request-edit-dept"
                  className="input"
                  value={dialog.department}
                  onChange={(e) => setDialog({ department: e.target.value, date: null, employee: null })}
                >
                  {bulkDepartments.map((d) => (
                    <option key={d.key} value={d.key}>{d.label}</option>
                  ))}
                </select>
              </div>
            )}
            <label className="label mt-4" htmlFor="request-edit-note">Changes needed</label>
            <textarea
              id="request-edit-note"
              className="input min-h-20"
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Describe the changes you need"
              autoFocus
            />
            {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <div className="mt-4 flex justify-end">
              <div className="flex gap-2">
                <button type="button" className="btn" disabled={pending} onClick={() => setDialog(null)}>Cancel</button>
                <button type="button" className="btn btn-primary" disabled={pending} onClick={send}>
                  {pending ? "Sending…" : "Send request"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </RequestEditContext.Provider>
  );
}

function StatusBadge({ status, open }: { status: "PENDING" | "APPROVED" | "REJECTED"; open: boolean }) {
  const [text, cls] =
    status === "PENDING"
      ? ["Request pending", "bg-amber-100 text-amber-800"]
      : open
        ? ["Editing allowed", "bg-green-100 text-green-800"]
        : status === "REJECTED"
          ? ["Request denied", "bg-red-100 text-red-700"]
          : ["Locked again", "bg-slate-100 text-slate-600"];
  return <span className={`ml-2 rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>{text}</span>;
}
