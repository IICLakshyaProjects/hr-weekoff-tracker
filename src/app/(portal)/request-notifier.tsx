"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { PendingSummary } from "@/lib/month-lock";

const POLL_MS = 20_000;

const noSubscribe = () => () => {};
/** Browser notification permission; "unsupported" on the server so hydration matches. */
function usePermission(): string {
  return useSyncExternalStore(
    noSubscribe,
    () => (typeof Notification === "undefined" ? "unsupported" : Notification.permission),
    () => "unsupported",
  );
}

/** Admin-only: shows waiting edit requests and pops a notice when a new one arrives, without reloading. */
export function RequestNotifier({ initial }: { initial: PendingSummary }) {
  const router = useRouter();
  const pathname = usePathname();
  const [summary, setSummary] = useState(initial);
  const [fresh, setFresh] = useState<string | null>(null);
  const lastId = useRef(initial.latestId);
  const permission = usePermission();
  const [asked, setAsked] = useState(false);

  // Server data wins after a navigation or refresh.
  const [prevInitial, setPrevInitial] = useState(initial);
  if (prevInitial !== initial) {
    setPrevInitial(initial);
    setSummary(initial);
  }

  useEffect(() => {
    let stopped = false;
    async function poll() {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/edit-requests/pending", { cache: "no-store" });
        if (!res.ok || stopped) return;
        const next = (await res.json()) as PendingSummary;
        setSummary(next);
        if (next.latestId && next.latestId !== lastId.current && (lastId.current === null || next.latestId > lastId.current)) {
          setFresh(`New edit request from ${next.latest}`);
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            new Notification("Week Off Tracker", { body: `New edit request from ${next.latest}` });
          }
          router.refresh(); // update the nav count and the requests list
        }
        lastId.current = next.latestId;
      } catch {
        // offline or server restarting; try again next tick
      }
    }
    const timer = setInterval(poll, POLL_MS);
    document.addEventListener("visibilitychange", poll);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [router]);

  const onRequestsTab = pathname === "/editing";
  const canAskPermission = permission === "default" && !asked;

  return (
    <>
      {summary.count > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span>
            🔔 {summary.count} edit request{summary.count === 1 ? "" : "s"} waiting for your decision
            {summary.latest ? ` · latest from ${summary.latest}` : ""}
          </span>
          <span className="flex items-center gap-3">
            {canAskPermission && (
              <button type="button" className="text-xs underline" onClick={() => Notification.requestPermission().finally(() => setAsked(true))}>
                Enable desktop alerts
              </button>
            )}
            {!onRequestsTab && (
              <Link href="/editing?tab=requests" className="btn btn-primary">
                Review
              </Link>
            )}
          </span>
        </div>
      )}
      {fresh && (
        <div className="fixed bottom-4 right-4 z-50 flex max-w-sm items-start gap-3 rounded-md border border-amber-300 bg-white px-4 py-3 text-sm shadow-lg" role="status">
          <span className="flex-1">🔔 {fresh}</span>
          <Link href="/editing?tab=requests" className="font-medium text-indigo-600 underline" onClick={() => setFresh(null)}>
            Open
          </Link>
          <button type="button" className="text-slate-400 hover:text-slate-600" aria-label="Dismiss" onClick={() => setFresh(null)}>
            ✕
          </button>
        </div>
      )}
    </>
  );
}
