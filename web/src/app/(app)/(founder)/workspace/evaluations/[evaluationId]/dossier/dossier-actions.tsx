"use client";

// Block 6 action bar (G13-W5-D3, S-D3; BA spec §A.3 block 6, §A.5 E3.6):
// add to watchlist · mark as invested (portfolio) · request intro · add to
// batch · export IC memo. Every click POSTs one JSON action to
// /api/evaluations/[id]/actions (watchlist / portfolio / intro) or
// /api/evaluations/[id]/ic-report (export) and reports the outcome inline;
// nothing is charged and nothing is fabricated — a mailto intro opens the
// mail client, a CRM intro says so.

import { useState } from "react";
import Link from "next/link";
import { trackEvent } from "@/lib/analytics";
import { userErrorMessage } from "@/lib/ui/user-error";

export interface DossierActionsProps {
  evaluationId: string;
  founderClaimed: boolean;
  founderEmailOnFile: boolean;
  /** Scout → one_page; Firm / Program → memo (server clamps anyway). */
  icKind: "memo" | "one_page";
  batchAllowed: boolean;
}

type Note = { tone: "ok" | "err"; text: string } | null;

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as T & { ok?: boolean; message?: string; error?: string };
  if (!res.ok || json.ok === false) throw Object.assign(new Error(json.message ?? json.error ?? `HTTP ${res.status}`), { status: res.status, body: json });
  return json;
}

export function DossierActions({ evaluationId, founderClaimed, founderEmailOnFile, icKind, batchAllowed }: DossierActionsProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<Note>(null);
  const [portfolioOpen, setPortfolioOpen] = useState(false);
  const [valuation, setValuation] = useState("");
  const [ownership, setOwnership] = useState("");
  const base = `/api/evaluations/${encodeURIComponent(evaluationId)}`;

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setNote(null);
    try {
      await fn();
    } catch (err) {
      setNote({ tone: "err", text: userErrorMessage(err, "That did not go through — try again.") });
    } finally {
      setBusy(null);
    }
  };

  const watchlist = () =>
    run("watchlist", async () => {
      const r = await postJson<{ added: boolean; ticker: string }>(`${base}/actions`, { action: "watchlist" });
      setNote({ tone: "ok", text: r.added ? `Added to your watchlist (${r.ticker}).` : `Already on your watchlist (${r.ticker}).` });
    });

  const portfolio = () =>
    run("portfolio", async () => {
      const v = valuation.trim() ? Number(valuation.replace(/[^0-9.]/g, "")) : null;
      const o = ownership.trim() ? Number(ownership) : null;
      const r = await postJson<{ id: string; created: boolean }>(`${base}/actions`, {
        action: "portfolio",
        valuation_aud: v != null && Number.isFinite(v) ? v : null,
        ownership_pct: o != null && Number.isFinite(o) ? o : null,
      });
      setPortfolioOpen(false);
      setNote({ tone: "ok", text: r.created ? "Marked as invested — it is in your portfolio." : "Portfolio entry updated." });
    });

  const intro = () =>
    run("intro", async () => {
      const r = await postJson<{ channel: "mailto" | "crm"; href?: string; created?: boolean; notified?: boolean }>(`${base}/actions`, { action: "intro" });
      trackEvent("intro_requested", { channel: r.channel, side: "evaluator" });
      if (r.channel === "mailto" && r.href) {
        window.location.href = r.href;
        setNote({ tone: "ok", text: "Opening your mail client with the intro request." });
      } else {
        setNote({ tone: "ok", text: r.created ? "Intro requested — you are now in the founder's investor CRM and they have been notified." : "Intro already requested — the founder's CRM has you; they have been reminded." });
      }
    });

  const exportIc = () =>
    run("ic", async () => {
      const r = await postJson<{ ic_report_id: string; kind: "memo" | "one_page"; pages: number | null; pdf_url: string }>(`${base}/ic-report`, { kind: icKind });
      trackEvent("ic_memo_exported", { evaluation_id: evaluationId, kind: r.kind });
      window.open(r.pdf_url, "_blank", "noopener");
      setNote({ tone: "ok", text: `${r.kind === "memo" ? "IC memo" : "One-pager"} exported${r.pages ? ` (${r.pages} page${r.pages === 1 ? "" : "s"})` : ""} — the PDF opened in a new tab and is stored on this evaluation.` });
    });

  const btn = "inline-flex min-h-9 items-center rounded-lg border border-surface-300 bg-surface px-3 py-1.5 text-xs font-semibold text-ink-800 hover:bg-surface-50 disabled:opacity-60";
  return (
    <div data-testid="dossier-actions">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn} onClick={watchlist} disabled={busy !== null} data-testid="action-watchlist">
          {busy === "watchlist" ? "Adding…" : "Add to watchlist"}
        </button>
        <button type="button" className={btn} onClick={() => setPortfolioOpen((o) => !o)} disabled={busy !== null} data-testid="action-portfolio" aria-expanded={portfolioOpen}>
          Mark as invested
        </button>
        <button type="button" className={btn} onClick={intro} disabled={busy !== null || (!founderClaimed && !founderEmailOnFile)} data-testid="action-intro" title={!founderClaimed && !founderEmailOnFile ? "Add the founder's email on the evaluation first" : undefined}>
          {busy === "intro" ? "Requesting…" : "Request intro"}
        </button>
        {batchAllowed ? (
          <Link href={`/workspace/evaluations?batch=${encodeURIComponent(evaluationId)}`} className={btn} data-testid="action-batch">
            Add to batch
          </Link>
        ) : null}
        <button type="button" className="inline-flex min-h-9 items-center rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60" onClick={exportIc} disabled={busy !== null} data-testid="action-export-ic">
          {busy === "ic" ? "Exporting…" : icKind === "memo" ? "Export IC memo" : "Export one-pager"}
        </button>
      </div>
      {portfolioOpen ? (
        <form
          className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-surface-200 bg-surface-50 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void portfolio();
          }}
          data-testid="portfolio-form"
        >
          <label className="text-xs text-ink-700">
            Valuation (A$, optional)
            <input value={valuation} onChange={(e) => setValuation(e.target.value)} inputMode="numeric" className="mt-1 block w-40 rounded border border-surface-300 px-2 py-1 text-sm" placeholder="e.g. 4000000" />
          </label>
          <label className="text-xs text-ink-700">
            Ownership % (optional)
            <input value={ownership} onChange={(e) => setOwnership(e.target.value)} inputMode="decimal" className="mt-1 block w-28 rounded border border-surface-300 px-2 py-1 text-sm" placeholder="e.g. 7.5" />
          </label>
          <button type="submit" className="inline-flex min-h-9 items-center rounded-lg bg-ink-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60" disabled={busy !== null}>
            {busy === "portfolio" ? "Saving…" : "Save to portfolio"}
          </button>
        </form>
      ) : null}
      {note ? (
        <p className={`mt-2 text-xs ${note.tone === "ok" ? "text-emerald-800" : "text-red-700"}`} role={note.tone === "err" ? "alert" : "status"} data-testid="action-note">
          {note.text}
        </p>
      ) : null}
    </div>
  );
}
