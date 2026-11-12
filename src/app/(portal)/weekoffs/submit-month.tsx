"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitMonth } from "@/app/actions/month-lock";

export function SubmitMonth({
  month,
  monthLabel,
  departments,
}: {
  month: string;
  monthLabel: string;
  departments: { key: string; label: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const names = departments.map((d) => d.label).join(", ");

  async function confirm() {
    setPending(true);
    setError(null);
    try {
      const res = await submitMonth(month, departments.map((d) => d.key));
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Could not submit. Please retry.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => { setError(null); setOpen(true); }}>
        Save
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby="submit-month-title">
          <div className="card w-full max-w-md p-5">
            <h2 id="submit-month-title" className="text-lg font-semibold">Submit {monthLabel}?</h2>
            <p className="mt-2 text-sm text-slate-600">
              This submits week offs for <span className="font-medium text-slate-800">{names}</span> in {monthLabel}. After you submit, this cannot be undone.
              The month stays locked until an admin allows editing again.
            </p>
            {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn" disabled={pending} onClick={() => setOpen(false)}>Cancel</button>
              <button type="button" className="btn btn-primary" disabled={pending} onClick={confirm}>
                {pending ? "Submitting…" : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
