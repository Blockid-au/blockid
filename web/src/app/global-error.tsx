"use client";

import * as React from "react";

// Inline Sentry client report — cannot import server-only modules in client error boundary
function reportToSentry(err: Error) {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  try {
    const url = new URL(dsn);
    const key = url.username;
    const pid = url.pathname.replace(/^\//, "");
    const host = url.hostname;
    void fetch(`https://${host}/api/${pid}/store/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=blockid/1.0, sentry_key=${key}`,
      },
      body: JSON.stringify({
        level: "error",
        platform: "javascript",
        environment: process.env.NODE_ENV,
        exception: { values: [{ type: err.name, value: err.message }] },
      }),
    });
  } catch { /* fail silently */ }
}

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  React.useEffect(() => {
    reportToSentry(error);
  }, [error]);

  return (
    <html lang="en-AU">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f8fafc" }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
          <div style={{ textAlign: "center", maxWidth: "400px" }}>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>⚡</div>
            <h1 style={{ fontSize: "24px", fontWeight: 700, color: "#1e293b", margin: "0 0 8px 0" }}>Something went wrong</h1>
            <p style={{ fontSize: "14px", color: "#64748b", margin: "0 0 24px 0" }}>
              We hit a temporary issue. Please try again.
            </p>
            {error.digest && (
              <p style={{ fontSize: "11px", color: "#94a3b8", marginBottom: "16px", fontFamily: "monospace" }}>
                Error ID: {error.digest}
              </p>
            )}
            <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={reset}
                style={{ height: "44px", padding: "0 24px", borderRadius: "12px", background: "#2563eb", color: "white", fontWeight: 600, fontSize: "14px", border: "none", cursor: "pointer" }}
              >
                Try Again
              </button>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- global-error renders its own html root, next/link not available */}
              <a
                href="/"
                style={{ height: "44px", padding: "0 24px", borderRadius: "12px", background: "white", color: "#334155", fontWeight: 600, fontSize: "14px", border: "1px solid #e2e8f0", textDecoration: "none", display: "inline-flex", alignItems: "center" }}
              >
                Go to Homepage
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
