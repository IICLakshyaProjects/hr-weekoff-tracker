"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setWeekLock } from "@/app/actions/week-lock";

/** Enable / disable the Monday–Wednesday week off lock. */
export function WeekLockToggle({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function change(next: boolean) {
    setMessage(null);
    start(async () => {
      const res = await setWeekLock(next);
      setMessage({ ok: res.ok, text: res.message });
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">
            Week off lock{" "}
            <span
              className={`ml-1 rounded-full px-2 py-0.5 text-xs font-medium ${enabled ? "bg-green-100 text-green-800" : "bg-slate-200 text-slate-700"}`}
            >
              {enabled ? "Enabled" : "Disabled"}
            </span>
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {enabled
              ? "Heads can update the current Monday–Sunday week only on Monday to Wednesday. After that the week is locked."
              : "Heads can update week offs on any day. Weeks a head has saved stay locked."}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" className={`btn ${enabled ? "btn-primary" : ""}`} disabled={pending || enabled} onClick={() => change(true)}>
            Enable
          </button>
          <button type="button" className={`btn ${!enabled ? "btn-primary" : ""}`} disabled={pending || !enabled} onClick={() => change(false)}>
            Disable
          </button>
        </div>
      </div>
      {message && (
        <p className={`mt-3 rounded-md px-3 py-2 text-sm ${message.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{message.text}</p>
      )}
    </div>
  );
}
