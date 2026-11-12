"use client";

import { useEffect } from "react";

function details(error: unknown): { message: string; stack?: string; digest?: string } {
  if (error instanceof Error) {
    const digest = "digest" in error && typeof error.digest === "string" ? error.digest : undefined;
    return { message: error.message, stack: error.stack, digest };
  }
  return { message: typeof error === "string" ? error : "Unknown error" };
}

export function ErrorScreen({ error, retry }: { error: unknown; retry: () => void }) {
  const dev = process.env.NODE_ENV === "development";
  const info = details(error);

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="card w-full max-w-2xl p-6">
        <p className="text-sm font-semibold text-red-600">Error</p>
        <h1 className="mt-1 text-xl font-semibold">Something went wrong</h1>
        {dev ? (
          <>
            <p className="mt-3 text-sm text-slate-700">{info.message}</p>
            {info.digest && <p className="mt-1 font-mono text-xs text-slate-500">digest: {info.digest}</p>}
            {info.stack && (
              <pre className="mt-3 max-h-80 overflow-auto rounded-md bg-slate-900 p-3 text-xs leading-relaxed text-slate-100">{info.stack}</pre>
            )}
          </>
        ) : (
          <p className="mt-3 text-sm text-slate-600">
            The page could not be loaded. Try again, and contact HR if it keeps happening.
            {info.digest ? ` Reference: ${info.digest}` : ""}
          </p>
        )}
        <button type="button" className="btn btn-primary mt-4" onClick={() => retry()}>
          Try again
        </button>
      </div>
    </div>
  );
}
