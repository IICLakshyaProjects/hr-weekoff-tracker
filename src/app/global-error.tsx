"use client";

import { useEffect } from "react";

export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const dev = process.env.NODE_ENV === "development";
  const message = error instanceof Error ? error.message : "Unknown error";
  const stack = error instanceof Error ? error.stack : undefined;
  const digest = error instanceof Error && "digest" in error && typeof error.digest === "string" ? error.digest : undefined;

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", background: "#f6f7f9", color: "#0f172a", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <section style={{ width: "100%", maxWidth: 720, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 24 }}>
            <p style={{ margin: 0, color: "#dc2626", fontSize: 14, fontWeight: 600 }}>Error</p>
            <h1 style={{ margin: "4px 0 0", fontSize: 22 }}>Something went wrong</h1>
            {dev ? (
              <>
                <p style={{ marginTop: 12, fontSize: 14 }}>{message}</p>
                {digest && <p style={{ marginTop: 4, fontFamily: "ui-monospace, monospace", fontSize: 12, color: "#64748b" }}>digest: {digest}</p>}
                {stack && (
                  <pre style={{ marginTop: 12, maxHeight: 320, overflow: "auto", background: "#0f172a", color: "#f8fafc", padding: 12, borderRadius: 8, fontSize: 12 }}>
                    {stack}
                  </pre>
                )}
              </>
            ) : (
              <p style={{ marginTop: 12, fontSize: 14, color: "#475569" }}>
                The tracker could not be loaded. Try again{digest ? ` (reference ${digest})` : ""}.
              </p>
            )}
            <button
              type="button"
              onClick={() => retry()}
              style={{ marginTop: 16, background: "#4f46e5", color: "#fff", border: 0, borderRadius: 8, padding: "8px 14px", fontSize: 14, cursor: "pointer" }}
            >
              Try again
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
