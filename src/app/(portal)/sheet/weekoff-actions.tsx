"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteSheetWeekoffs, updateSheetWeekoffs } from "@/app/actions/weekoffs";

const SLOTS = 4;

type Props = { employeeId: number; name: string; dates: string[]; labels: string[]; canEdit: boolean };

/** Match the sheet: one week off sits in Date - 2, with Date - 1 shown as Working. */
function fieldsFrom(dates: string[]): string[] {
  const slots = Array.from({ length: SLOTS }, () => "");
  if (dates.length === 1) {
    slots[1] = dates[0];
    return slots;
  }
  dates.slice(0, SLOTS).forEach((d, i) => {
    slots[i] = d;
  });
  return slots;
}

/** Action column of the sheet: Edit (super admin) and Delete, each with its own popup. */
export function WeekoffActions({ employeeId, name, dates, labels, canEdit }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"edit" | "delete" | null>(null);
  const [fields, setFields] = useState<string[]>(() => fieldsFrom(dates));

  function openEdit() {
    setFields(fieldsFrom(dates));
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

  function setField(index: number, value: string) {
    setFields((prev) => prev.map((v, i) => (i === index ? value : v)));
  }

  function onSave(e: React.FormEvent) {
    e.preventDefault();
    const chosen = fields.map((d) => d.trim()).filter(Boolean);
    if (chosen.length < 1) return setError("Choose at least one week off date.");
    if (new Set(chosen).size !== chosen.length) return setError("Week off dates must be different days.");
    run(() => updateSheetWeekoffs(employeeId, dates, chosen));
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
                  {labels.map((label, i) => (label ? <li key={i}>Date - {i + 1}: {label}</li> : null))}
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
                <p className="mt-1 text-sm text-slate-600">
                  {name}. Up to 4 dates in the same Monday–Sunday week. Leave unused dates empty. One date is shown as Working in Date - 1.
                </p>
                {fields.map((value, i) => (
                  <div key={i}>
                    <label className="label mt-4" htmlFor={`wo${i + 1}-${employeeId}-${dates[0] ?? "new"}`}>
                      Week off Date - {i + 1}
                    </label>
                    <input
                      id={`wo${i + 1}-${employeeId}-${dates[0] ?? "new"}`}
                      type="date"
                      className="input"
                      value={value}
                      onChange={(e) => setField(i, e.target.value)}
                    />
                  </div>
                ))}

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
