"use client";

// Client-side "Download CSV" cell for /reseller/reports.
//
// Fetches the freshly-minted 24 h signed URL from
// /api/reseller/reports/[month]/signed-url on click, then navigates to it in
// a new tab. Keeps the URL out of the DOM until the user opts in so a shared
// server-rendered page never leaks a signed link.

import { useState } from "react";

interface Props {
  month: string;
}

export function ReportDownloadCell({ month }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onClick = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reseller/reports/${month}/signed-url`);
      const body = (await res.json()) as
        | { ok: true; signed_url: string; filename: string }
        | { ok: false; reason: string };
      if (!res.ok || !body.ok) {
        const reason = body && "reason" in body ? body.reason : "download_failed";
        setError(reason);
        return;
      }
      window.open(body.signed_url, "_blank", "noopener,noreferrer");
    } catch {
      setError("network_error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="text-xs font-medium text-brand-700 underline disabled:cursor-not-allowed disabled:text-ink-400"
      >
        {loading ? "Minting link…" : "Download CSV"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
