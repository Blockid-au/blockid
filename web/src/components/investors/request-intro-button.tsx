"use client";

// "Request intro" on an "Investors who match" card (G13-W5-D3, S-D3; BA
// spec §A.5 E2.6). POST /api/investors/intro → the investor lands in the
// founder's CRM (investor_contacts, stage "contacted") and receives an
// `intro_requested` notification. The mailto link next to it stays as the
// manual fallback; this button never reveals the investor's email.

import { useState } from "react";
import { Send } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { userErrorMessage } from "@/lib/ui/user-error";

export interface RequestIntroButtonProps {
  investorId: string;
  name: string;
  firm: string | null;
  plan: string | null;
  mandateId?: string | null;
}

type State = { kind: "idle" } | { kind: "busy" } | { kind: "done"; created: boolean } | { kind: "error"; message: string };

export function RequestIntroButton({ investorId, name, firm, plan, mandateId }: RequestIntroButtonProps) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const run = async () => {
    setState({ kind: "busy" });
    try {
      const res = await fetch("/api/investors/intro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ investor_id: investorId, name, firm, plan, mandate_id: mandateId ?? null }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; created?: boolean; message?: string; error?: string };
      if (!res.ok || !body.ok) throw Object.assign(new Error(body.message ?? body.error ?? "Request failed"), { status: res.status, body });
      trackEvent("intro_requested", { channel: "crm", side: "founder" });
      setState({ kind: "done", created: body.created !== false });
    } catch (err) {
      setState({ kind: "error", message: userErrorMessage(err, "Could not request the intro — try the email link.") });
    }
  };
  if (state.kind === "done") {
    return (
      <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700" data-intro-requested>
        {state.created ? "Intro requested — they are in your pipeline" : "Already in your pipeline — reminder sent"}
      </span>
    );
  }
  return (
    <span className="mt-3 inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={state.kind === "busy"}
        className="inline-flex items-center gap-1 rounded-lg bg-action px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
        data-request-intro-crm
      >
        <Send className="h-3.5 w-3.5" aria-hidden /> {state.kind === "busy" ? "Requesting…" : "Request intro"}
      </button>
      {state.kind === "error" ? (
        <span className="text-xs text-red-700" role="alert">
          {state.message}
        </span>
      ) : null}
    </span>
  );
}
