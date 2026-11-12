"use client";

import { useEffect } from "react";
import { themeBootScript } from "@/lib/theme-script";

export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const dev = process.env.NODE_ENV === "development";
  const message = error instanceof Error ? error.message : "Unknown error";
  const stack = error instanceof Error ? error.stack : undefined;
  const digest = error instanceof Error && "digest" in error && typeof error.digest === "string" ? error.digest : undefined;

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        <style>{`
          body { margin: 0; min-height: 100vh; background: #f6f7f9; color: #0f172a; font-family: system-ui, sans-serif; }
          [data-theme="dark"] body { background: #081522; color: #f5f9fc; }
          [data-theme="dark"] .ge-card { background: #102a3d !important; border-color: #25465b !important; color: #f5f9fc !important; }
          [data-theme="dark"] .ge-muted { color: #c6d4df !important; }
          [data-theme="dark"] .ge-pre { background: #002a46 !important; }
          [data-theme="dark"] .ge-btn { background: #00528c !important; }
        `}</style>
      </head>
      <body>
        <main style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <section className="ge-card" style={{ width: "100%", maxWidth: 720, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 24 }}>
            <p style={{ margin: 0, color: "#dc2626", fontSize: 14, fontWeight: 600 }}>Error</p>
            <h1 style={{ margin: "4px 0 0", fontSize: 22 }}>Something went wrong</h1>
            {dev ? (
              <>
                <p style={{ marginTop: 12, fontSize: 14 }}>{message}</p>
                {digest && <p className="ge-muted" style={{ marginTop: 4, fontFamily: "ui-monospace, monospace", fontSize: 12, color: "#64748b" }}>digest: {digest}</p>}
                {stack && (
                  <pre className="ge-pre" style={{ marginTop: 12, maxHeight: 320, overflow: "auto", background: "#0f172a", color: "#f8fafc", padding: 12, borderRadius: 8, fontSize: 12 }}>
                    {stack}
                  </pre>
                )}
              </>
            ) : (
              <p className="ge-muted" style={{ marginTop: 12, fontSize: 14, color: "#475569" }}>
                The tracker could not be loaded. Try again{digest ? ` (reference ${digest})` : ""}.
              </p>
            )}
            <button
              type="button"
              className="ge-btn"
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
