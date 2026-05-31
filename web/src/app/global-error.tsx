"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
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
            <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={reset}
                style={{ height: "44px", padding: "0 24px", borderRadius: "12px", background: "#2563eb", color: "white", fontWeight: 600, fontSize: "14px", border: "none", cursor: "pointer" }}
              >
                Try Again
              </button>
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
