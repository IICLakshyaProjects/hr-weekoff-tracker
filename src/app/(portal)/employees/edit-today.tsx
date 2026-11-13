"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { allowEditingToday } from "@/app/actions/edit-window";

export function EditToday({
  label,
  weekdayOpen,
  enabledBy,
  enabledAt,
}: {
  label: string;
  weekdayOpen: boolean;
  enabledBy: string | null;
  enabledAt: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const enabled = weekdayOpen || !!enabledAt;

  async function allow() {
    setPending(true);
    setMessage(null);
    try {
      const res = await allowEditingToday();
      setMessage({ ok: res.ok, text: res.message });
      if (res.ok) router.refresh();
    } catch {
      setMessage({ ok: false, text: "Could not allow editing. Please retry." });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="card p-4">
      <h2 className="text-sm font-semibold">Editing days</h2>
      <p className="mt-1 text-sm text-slate-500">
        Department heads can update week offs on Monday, Tuesday, and Wednesday. Allow editing to open today as well.
      </p>
      {message && (
        <p className={`mt-3 rounded-md px-3 py-2 text-sm ${message.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{message.text}</p>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <div>
          <div className="font-medium">{label}</div>
          <div className="text-xs text-slate-500">
            {weekdayOpen
              ? "Open, because today is Monday, Tuesday, or Wednesday."
              : enabled
                ? `Open for today${enabledBy ? ` · allowed by ${enabledBy}` : ""}${enabledAt ? ` at ${enabledAt}` : ""}.`
                : "Closed. Week offs cannot be changed until you allow editing for today."}
          </div>
        </div>
        {!weekdayOpen && !enabledAt && (
          <button type="button" className="btn" disabled={pending} onClick={allow}>
            {pending ? "Updating…" : "Allow editing today"}
          </button>
        )}
      </div>
    </div>
  );
}
