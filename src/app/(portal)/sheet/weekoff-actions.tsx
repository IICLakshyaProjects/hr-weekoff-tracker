"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteSheetWeekoffs, updateSheetWeekoffs } from "@/app/actions/weekoffs";

type Props = { employeeId: number; name: string; dates: string[]; wo1: string; wo2: string; canEdit: boolean };

/** Action column of the sheet: Edit (super admin) and Delete, each with its own popup. */
export function WeekoffActions({ employeeId, name, dates, wo1, wo2, canEdit }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"edit" | "delete" | null>(null);

  const twoDays = dates.length >= 2;
  const [working, setWorking] = useState(!twoDays);
  const [date1, setDate1] = useState(twoDays ? dates[0] : "");
  const [date2, setDate2] = useState(dates[dates.length - 1] ?? "");

  function openEdit() {
    setWorking(!twoDays);
    setDate1(twoDays ? dates[0] : "");
    setDate2(dates[dates.length - 1] ?? "");
    setError(null);
    setMode("edit");
  }

  function openDelete() {
    setError(null);
    setMode("delete");
  }

  function close() {
    if (!pending) setMode(null);
  }

  function run(action: () => Promise<{ ok: boolean; message: string }>) {
    setError(null);
    start(async () => {
      const res = await action();
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setMode(null);
      router.refresh();
    });
  }

  function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!date2 || (!working && !date1)) return setError("Choose the week off date(s).");
    if (!working && date1 === date2) return setError("Date - 1 and Date - 2 must be different days.");
    run(() => updateSheetWeekoffs(employeeId, dates, working ? [date2] : [date1, date2]));
  }

  return (
    <div className="flex gap-2">
      {canEdit && (
        <button type="button" className="btn px-2 py-1 text-xs" onClick={openEdit}>
          Edit
        </button>
      )}
      <button type="button" className="btn px-2 py-1 text-xs text-red-600 hover:bg-red-50" onClick={openDelete}>
        Delete
      </button>

      {mode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={close}>
          <div className="card w-full max-w-sm whitespace-normal p-5 text-left" onClick={(e) => e.stopPropagation()}>
            {mode === "delete" ? (
              <>
                <h2 className="text-lg font-semibold">Delete week off?</h2>
                <p className="mt-2 text-sm text-slate-600">
                  This removes the week off for <b>{name}</b>:
                </p>
                <ul className="mt-1 list-disc pl-5 text-sm text-slate-700">
                  {twoDays && <li>Date - 1: {wo1}</li>}
                  <li>Date - 2: {wo2}</li>
                </ul>
                {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
                <div className="mt-5 flex justify-end gap-2">
                  <button type="button" className="btn" onClick={close} disabled={pending}>
                    No
                  </button>
                  <button
                    type="button"
                    className="btn bg-red-600 text-white hover:bg-red-700"
                    disabled={pending}
                    onClick={() => run(() => deleteSheetWeekoffs(employeeId, dates))}
                  >
                    {pending ? "Deleting…" : "Yes, delete"}
                  </button>
                </div>
              </>
            ) : (
              <form onSubmit={onSave}>
                <h2 className="text-lg font-semibold">Edit week off</h2>
                <p className="mt-1 text-sm text-slate-600">{name}</p>

                <span className="label mt-4">Week off Date - 1</span>
                <div className="flex items-center gap-4 text-sm">
                  <label className="flex items-center gap-1.5">
                    <input type="radio" name="wo1-mode" checked={working} onChange={() => setWorking(true)} /> Working
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input type="radio" name="wo1-mode" checked={!working} onChange={() => setWorking(false)} /> Week off
                  </label>
                </div>
                {!working && (
                  <input
                    type="date"
                    aria-label="Week off Date - 1"
                    className="input mt-2"
                    value={date1}
                    onChange={(e) => setDate1(e.target.value)}
                    required
                  />
                )}

                <label className="label mt-4" htmlFor={`wo2-${employeeId}-${dates[0]}`}>
                  Week off Date - 2
                </label>
                <input
                  id={`wo2-${employeeId}-${dates[0]}`}
                  type="date"
                  className="input"
                  value={date2}
                  onChange={(e) => setDate2(e.target.value)}
                  required
                />

                {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
                <div className="mt-5 flex justify-end gap-2">
                  <button type="button" className="btn" onClick={close} disabled={pending}>
                    Cancel
                  </button>
                  <button className="btn btn-primary" disabled={pending}>
                    {pending ? "Saving…" : "Save"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
