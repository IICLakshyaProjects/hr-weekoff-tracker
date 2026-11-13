"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { allowMonthEdit } from "@/app/actions/month-lock";
import { departmentLabel, formatLockPeriod } from "@/lib/department";

export type LockItem = {
  department: string;
  month: string;
  lockedBy: string | null;
  lockedAt: string;
};

export function MonthLocks({ locks }: { locks: LockItem[] }) {
  const router = useRouter();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function reopen(lock: LockItem) {
    const label = `${departmentLabel(lock.department)} · ${formatLockPeriod(lock.month)}`;
    if (!window.confirm(`Allow editing for ${label}? The department head can change it until they save again, and that save locks it.`)) return;
    const key = `${lock.department}|${lock.month}`;
    setPendingKey(key);
    setMessage(null);
    try {
      const res = await allowMonthEdit(lock.department, lock.month);
      setMessage({ ok: res.ok, text: res.message });
      if (res.ok) router.refresh();
    } catch {
      setMessage({ ok: false, text: "Could not allow editing. Please retry." });
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <div className="card p-4">
      <h2 className="text-sm font-semibold">Locked week offs</h2>
      <p className="mt-1 text-sm text-slate-500">
        A department head locks a Wednesday–Wednesday cycle by saving it. Allow editing to reopen that department for that cycle.
      </p>
      {message && (
        <p className={`mt-3 rounded-md px-3 py-2 text-sm ${message.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{message.text}</p>
      )}
      {locks.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No months are locked.</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 text-sm">
          {locks.map((lock) => {
            const key = `${lock.department}|${lock.month}`;
            return (
              <li key={key} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <div className="font-medium">{departmentLabel(lock.department)} · {formatLockPeriod(lock.month)}</div>
                  <div className="text-xs text-slate-500">
                    Saved {lock.lockedAt}{lock.lockedBy ? ` by ${lock.lockedBy}` : ""}
                  </div>
                </div>
                <button type="button" className="btn" disabled={pendingKey === key} onClick={() => reopen(lock)}>
                  {pendingKey === key ? "Updating…" : "Allow editing"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
