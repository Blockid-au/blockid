"use client";

// Header action "Export IC" (G13-W5-D3, S-D3; BA spec §A.2 header
// "Actions ▸ … Export IC", §A.5 S6 / F3). POST /api/evaluations/[id]/ic-report
// → opens the stored PDF in a new tab. The kind is the plan's (Scout →
// one-pager, Firm/Program → memo); the server clamps it again.

import { useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { userErrorMessage } from "@/lib/ui/user-error";

export function ExportIcButton({ evaluationId, kind }: { evaluationId: string; kind: "memo" | "one_page" }) {
  const [state, setState] = useState<{ kind: "idle" } | { kind: "busy" } | { kind: "done"; pages: number | null } | { kind: "error"; message: string }>({ kind: "idle" });
  const run = async () => {
    setState({ kind: "busy" });
    try {
      const res = await fetch(`/api/evaluations/${encodeURIComponent(evaluationId)}/ic-report`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind }) });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; kind?: "memo" | "one_page"; pages?: number | null; pdf_url?: string; message?: string; error?: string };
      if (!res.ok || !body.ok || !body.pdf_url) throw Object.assign(new Error(body.message ?? body.error ?? "Export failed"), { status: res.status, body });
      trackEvent("ic_memo_exported", { evaluation_id: evaluationId, kind: body.kind ?? kind });
      window.open(body.pdf_url, "_blank", "noopener");
      setState({ kind: "done", pages: body.pages ?? null });
    } catch (err) {
      setState({ kind: "error", message: userErrorMessage(err, "Export failed — try again.") });
    }
  };
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={state.kind === "busy"}
        className="inline-flex min-h-9 items-center rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        data-testid="export-ic"
      >
        {state.kind === "busy" ? "Exporting…" : kind === "memo" ? "Export IC memo" : "Export one-pager"}
      </button>
      {state.kind === "done" ? <span className="text-xs text-emerald-800">Exported{state.pages ? ` · ${state.pages} page${state.pages === 1 ? "" : "s"}` : ""}</span> : null}
      {state.kind === "error" ? (
        <span className="text-xs text-red-700" role="alert">
          {state.message}
        </span>
      ) : null}
    </span>
  );
}
