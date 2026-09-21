"use client";

/**
 * Listing readiness (S29-A) — /workspace/exit/listing.
 *
 *   - exchange tabs (ASX admission conditions / Nasdaq Capital Market);
 *   - score strip: met ÷ (met + not met), with not-confirmed and
 *     confirm-current-rule counted separately, never as met;
 *   - one card per rule: status, label, rule reference + as-at date, the
 *     basis (what the status was computed from — a stored record or a fact
 *     the founder entered), and "what to do next" for anything not met;
 *   - "Your facts" (editor+): the founder-ticked inputs behind the rows —
 *     audited FYs, profit by FY, balance-sheet figures, board / committee,
 *     market makers, AUD→USD rate, which holders are restricted;
 *   - PDF export with the price shown first (1 credit once per project,
 *     included for Growth+ / the equity add-on, re-downloads free).
 *
 * `initial` lets the colocated render test seed the state without a fetch.
 */

import * as React from "react";
import { Download, FileCheck2, Loader2, Save, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { EXCHANGES, exchangeLabel, formatAud, LISTING_READINESS_NOTE, statusLabel, type Exchange, type ReadinessRow, type ReadinessScore, type ReadinessStatus } from "@/lib/listing/readiness";
import type { ListingProfileFacts } from "@/lib/listing/profile";
import { ApiError, userErrorMessage } from "@/lib/ui/user-error";

export interface ListingReadinessState {
  exchange: Exchange;
  role: "owner" | "admin" | "editor" | "viewer" | null;
  rows: ReadinessRow[];
  score: ReadinessScore;
  facts: ListingProfileFacts;
  inputs: {
    holders: number;
    sharePriceAud: number | null;
    profitLast12mAud: number | null;
    profitCoverageMonths: number;
    incorporatedAt: string | null;
    shareholders: Array<{ id: string | null; name: string; role: string; sharesHeld: number; restricted: boolean }>;
  } | null;
  pdf: { listedCost: number; cost: number; included: boolean; includedVia: "addon" | "growth" | null; alreadyCharged: boolean };
}

export function canEditFacts(role: ListingReadinessState["role"]): boolean {
  return role === "owner" || role === "admin" || role === "editor";
}

const STATUS_CLASS: Record<ReadinessStatus, string> = {
  met: "bg-emerald-50 text-emerald-700 border-emerald-200",
  not_met: "bg-red-50 text-red-700 border-red-200",
  not_confirmed: "bg-amber-50 text-amber-800 border-amber-200",
  confirm_current_rule: "bg-brand-50 text-brand-700 border-brand-200",
};

/** "Export PDF · 1 credit" / "Export PDF · included (Growth+)" / "Export PDF · paid, free re-download". */
export function pdfButtonLabel(pdf: ListingReadinessState["pdf"]): string {
  if (pdf.included) return `Export PDF · included (${pdf.includedVia === "addon" ? "equity add-on" : "Growth+"})`;
  if (pdf.alreadyCharged) return "Export PDF · paid, free re-download";
  return `Export PDF · ${pdf.cost} credit${pdf.cost === 1 ? "" : "s"} once per project`;
}

type Draft = Record<string, string>;

const DATE_FIELDS: Array<[keyof ListingProfileFacts, string]> = [
  ["audited_accounts_confirmed_at", "Audited accounts confirmed on"],
  ["constitution_reviewed_at", "Constitution reviewed against LR 15.11 on"],
  ["governance_statement_at", "Corporate governance statement prepared on"],
  ["escrow_acknowledged_at", "Escrow expectations acknowledged on"],
  ["director_checks_at", "Director good-fame checks completed on"],
  ["audit_committee_at", "Audit committee established on"],
  ["code_of_conduct_at", "Code of conduct adopted on"],
  ["balance_sheet_confirmed_at", "Balance-sheet figures confirmed on"],
];
const INT_FIELDS: Array<[keyof ListingProfileFacts, string]> = [
  ["directors_total", "Directors on the board"],
  ["independent_directors", "Independent directors"],
  ["audit_committee_independent_members", "Independent audit committee members"],
  ["market_makers", "Market makers committed (Nasdaq)"],
];
const MONEY_FIELDS: Array<[keyof ListingProfileFacts, string]> = [
  ["nta_after_raise_aud", "NTA after raising costs (A$)"],
  ["working_capital_aud", "Working capital (A$)"],
  ["stockholders_equity_aud", "Stockholders' equity (A$)"],
  ["expected_market_cap_aud", "Expected market cap at listing (A$)"],
  ["proposed_issue_price_aud", "Proposed issue price (A$ per share)"],
  ["aud_usd_rate", "AUD→USD rate (1 AUD = x USD)"],
];

function draftFromFacts(f: ListingProfileFacts): Draft {
  const d: Draft = {};
  for (const [k] of [...DATE_FIELDS, ...INT_FIELDS, ...MONEY_FIELDS]) {
    const v = f[k];
    d[k] = v === undefined || v === null ? "" : String(v);
  }
  d.audited_accounts_fys = (f.audited_accounts_fys ?? []).join(", ");
  d.asx_test = f.asx_test ?? "";
  const byFy = f.profit_by_fy ?? [];
  for (let i = 0; i < 3; i++) {
    d[`fy${i}`] = byFy[i]?.fy ?? "";
    d[`profit${i}`] = byFy[i] ? String(byFy[i].profit_aud) : "";
  }
  return d;
}

/** Draft → PATCH body. Empty string clears a key (sent as null). Pure — exported for the suite. */
export function patchFromDraft(d: Draft, restrictedIds: string[]): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const [k] of DATE_FIELDS) body[k] = d[k] ? d[k] : null;
  for (const [k] of INT_FIELDS) body[k] = d[k] ? Math.round(Number(d[k])) : null;
  for (const [k] of MONEY_FIELDS) body[k] = d[k] ? Number(d[k]) : null;
  const fys = (d.audited_accounts_fys ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .map((s) => (/^\d{4}$/.test(s) ? `FY${s}` : s));
  body.audited_accounts_fys = fys.length ? fys : null;
  body.asx_test = d.asx_test ? d.asx_test : null;
  const profit: Array<{ fy: string; profit_aud: number }> = [];
  for (let i = 0; i < 3; i++) {
    const fy = (d[`fy${i}`] ?? "").trim().toUpperCase();
    const p = d[`profit${i}`];
    if (fy && p !== "" && p !== undefined) profit.push({ fy: /^\d{4}$/.test(fy) ? `FY${fy}` : fy, profit_aud: Number(p) });
  }
  body.profit_by_fy = profit.length ? profit : null;
  body.restricted_holder_ids = restrictedIds.length ? restrictedIds : null;
  return body;
}

export function ListingReadinessClient({ initial }: { initial?: ListingReadinessState }) {
  const [state, setState] = React.useState<ListingReadinessState | null>(initial ?? null);
  const [exchange, setExchange] = React.useState<Exchange>(initial?.exchange ?? "asx");
  const [loading, setLoading] = React.useState(!initial);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<Draft>(() => draftFromFacts(initial?.facts ?? {}));
  const [restricted, setRestricted] = React.useState<string[]>(initial?.facts.restricted_holder_ids ?? []);
  const [showFacts, setShowFacts] = React.useState(false);

  const apply = React.useCallback((d: Record<string, unknown> | null) => {
    if (d?.ok) {
      const s = d as unknown as ListingReadinessState;
      setState(s);
      setDraft(draftFromFacts(s.facts ?? {}));
      setRestricted(s.facts?.restricted_holder_ids ?? []);
    } else setError((d?.error as string | undefined) ?? "Could not load the checklist");
  }, []);

  const load = React.useCallback(
    async (ex: Exchange) => {
      try {
        const res = await fetch(`/api/listing/readiness?exchange=${ex}`);
        apply(await res.json().catch(() => null));
      } catch {
        setError("Network error");
      }
    },
    [apply],
  );

  React.useEffect(() => {
    if (initial) return;
    let alive = true;
    fetch(`/api/listing/readiness?exchange=${exchange}`)
      .then((r) => r.json())
      .then((d) => alive && apply(d))
      .catch(() => alive && setError("Network error"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [initial, exchange, apply]);

  const saveFacts = React.useCallback(async () => {
    setError(null);
    setNotice(null);
    setBusy("save");
    try {
      const res = await fetch("/api/listing/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patchFromDraft(draft, restricted)) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(userErrorMessage(ApiError.fromBody(res.status, json), "Could not save your facts"));
        return;
      }
      setNotice("Facts saved — the checklist has been recomputed.");
      await load(exchange);
    } finally {
      setBusy(null);
    }
  }, [draft, restricted, exchange, load]);

  const download = React.useCallback(
    async (blob: Blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `listing-readiness-${exchange}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
    [exchange],
  );

  const exportPdf = React.useCallback(async () => {
    if (!state) return;
    setError(null);
    setNotice(null);
    setBusy("pdf");
    try {
      if (state.pdf.cost === 0) {
        const res = await fetch(`/api/listing/readiness/pdf?exchange=${exchange}`);
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          setError(userErrorMessage(ApiError.fromBody(res.status, json), "Could not export the PDF"));
          return;
        }
        await download(await res.blob());
        return;
      }
      const preview = await fetch("/api/listing/readiness/pdf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ exchange }) });
      const pj = await preview.json().catch(() => ({}));
      if (!preview.ok) {
        setError(pj.error === "insufficient_credits" ? `Not enough credits — ${pj.creditsRequired} needed, balance ${pj.balance}.` : (pj.error ?? "Could not price the export"));
        return;
      }
      const ok = window.confirm(`Export the ${exchangeLabel(exchange)} checklist as a PDF for ${pj.cost} credit${pj.cost === 1 ? "" : "s"}? ${pj.creditNote} Later downloads of either exchange are free. Balance: ${pj.balance}.`);
      if (!ok) return;
      const res = await fetch("/api/listing/readiness/pdf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ exchange, confirm: true }) });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(userErrorMessage(ApiError.fromBody(res.status, json), "Could not export the PDF"));
        return;
      }
      await download(await res.blob());
      setNotice(`PDF exported — ${res.headers.get("x-blockid-credits-charged") ?? pj.cost} credit charged; re-downloads are free.`);
      await load(exchange);
    } catch {
      setError("Network error");
    } finally {
      setBusy(null);
    }
  }, [state, exchange, download, load]);

  if (loading && !state) return <div className="animate-pulse h-40 bg-surface-100 rounded-2xl" data-testid="listing-loading" />;
  if (!state) {
    return (
      <div className="rounded-2xl border border-surface-200 bg-surface-50 p-4 text-xs text-ink-500" data-testid="listing-error">
        {error ?? "Listing readiness unavailable"}
      </div>
    );
  }

  const editable = canEditFacts(state.role);
  const input = "mt-1 w-full rounded-lg border border-surface-200 bg-white px-2 py-1.5 text-xs text-ink-800";

  return (
    <section className="space-y-5" data-testid="listing-readiness">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-surface-200 bg-surface-50 p-1" role="tablist" data-testid="listing-tabs">
          {EXCHANGES.map((ex) => (
            <button
              key={ex}
              type="button"
              role="tab"
              aria-selected={exchange === ex}
              data-testid={`listing-tab-${ex}`}
              onClick={() => setExchange(ex)}
              className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold", exchange === ex ? "bg-white text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-800")}
            >
              {ex === "asx" ? "ASX" : "Nasdaq Capital Market"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {editable && (
            <button type="button" onClick={() => setShowFacts((v) => !v)} data-testid="listing-toggle-facts" className="rounded-lg border border-surface-200 px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-surface-50">
              {showFacts ? "Hide your facts" : "Enter your facts"}
            </button>
          )}
          {editable && state.role !== null && (
            <button type="button" onClick={() => void exportPdf()} disabled={busy !== null} data-testid="listing-export" className="inline-flex items-center gap-1.5 rounded-lg bg-action px-3 py-1.5 text-xs font-semibold text-on-action hover:bg-action-hover disabled:opacity-60">
              {busy === "pdf" ? <Loader2 strokeWidth={1.75} className="h-3.5 w-3.5 animate-spin" /> : <Download strokeWidth={1.75} className="h-3.5 w-3.5" />}
              {pdfButtonLabel(state.pdf)}
            </button>
          )}
        </div>
      </div>

      {state.role === null && (
        <p className="rounded-xl border border-surface-200 bg-surface-50 px-3 py-2 text-xs text-ink-500" data-testid="listing-no-project">
          Pick a startup first — the checklist is computed from that project&apos;s cap table, share price, bank lines and profile.
        </p>
      )}

      <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 flex gap-2" data-testid="listing-note">
        <ShieldAlert strokeWidth={1.75} className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>{LISTING_READINESS_NOTE}</span>
      </p>

      {error && (
        <p className="text-xs text-red-700" role="alert" data-testid="listing-error-inline">
          {error}
        </p>
      )}
      {notice && (
        <p className="text-xs text-emerald-700" data-testid="listing-notice">
          {notice}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-5" data-testid="listing-score">
        <ScoreCell label="Readiness" value={state.score.pct === null ? "—" : `${state.score.pct} %`} hint="met ÷ (met + not met)" />
        <ScoreCell label="Met" value={String(state.score.met)} />
        <ScoreCell label="Not met" value={String(state.score.notMet)} />
        <ScoreCell label="Not confirmed" value={String(state.score.notConfirmed)} hint="fact not on file — enter it" />
        <ScoreCell label="Confirm rule" value={String(state.score.confirmCurrentRule)} hint="threshold not asserted here" />
      </div>

      {state.inputs && (
        <p className="text-xs text-ink-500" data-testid="listing-inputs">
          Computed from {state.inputs.holders} cap-table holder{state.inputs.holders === 1 ? "" : "s"}
          {state.inputs.sharePriceAud !== null ? ` at ${formatAud(state.inputs.sharePriceAud)} per share (current mid)` : " — no share price yet (run a valuation)"}
          {state.inputs.profitLast12mAud !== null ? `; bank-line profit over the last 12 months ${formatAud(state.inputs.profitLast12mAud)} (${state.inputs.profitCoverageMonths} months of lines)` : state.inputs.profitCoverageMonths > 0 ? `; ${state.inputs.profitCoverageMonths} months of bank lines — 12 needed for the profit rows` : "; no bank lines imported"}
          {state.inputs.incorporatedAt ? `; incorporated ${state.inputs.incorporatedAt}` : "; incorporation date not on the funding profile"}.
        </p>
      )}

      {showFacts && editable && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void saveFacts();
          }}
          className="rounded-2xl border border-brand-200 bg-brand-50 p-4 space-y-4"
          data-testid="listing-facts-form"
        >
          <p className="text-sm font-semibold text-ink-800 flex items-center gap-1.5">
            <FileCheck2 strokeWidth={1.75} className="h-4 w-4" /> Your facts
          </p>
          <p className="text-xs text-ink-600">Only what you enter here is used — leave a field empty and its row stays &quot;not confirmed&quot;. Dates record when you confirmed the item, not when the rule was met.</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-xs text-ink-600 sm:col-span-2">
              Audited financial years (e.g. FY2024, FY2025, FY2026)
              <input value={draft.audited_accounts_fys} onChange={(e) => setDraft({ ...draft, audited_accounts_fys: e.target.value })} data-testid="fact-audited-fys" className={input} placeholder="FY2025, FY2026" />
            </label>
            <label className="text-xs text-ink-600">
              ASX test you are targeting
              <select value={draft.asx_test} onChange={(e) => setDraft({ ...draft, asx_test: e.target.value })} data-testid="fact-asx-test" className={input}>
                <option value="">Assess both</option>
                <option value="assets">Assets test (LR 1.3)</option>
                <option value="profit">Profit test (LR 1.2)</option>
              </select>
            </label>
            {[0, 1, 2].map((i) => (
              <div key={i} className="grid grid-cols-2 gap-2">
                <label className="text-xs text-ink-600">
                  Financial year
                  <input value={draft[`fy${i}`]} onChange={(e) => setDraft({ ...draft, [`fy${i}`]: e.target.value })} data-testid={`fact-fy-${i}`} className={input} placeholder={`FY${2024 + i}`} />
                </label>
                <label className="text-xs text-ink-600">
                  Profit from continuing ops (A$)
                  <input type="number" step="0.01" value={draft[`profit${i}`]} onChange={(e) => setDraft({ ...draft, [`profit${i}`]: e.target.value })} data-testid={`fact-profit-${i}`} className={input} />
                </label>
              </div>
            ))}
            {MONEY_FIELDS.map(([k, label]) => (
              <label key={k} className="text-xs text-ink-600">
                {label}
                <input type="number" step="any" min={0} value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} data-testid={`fact-${k}`} className={input} />
              </label>
            ))}
            {INT_FIELDS.map(([k, label]) => (
              <label key={k} className="text-xs text-ink-600">
                {label}
                <input type="number" step={1} min={0} value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} data-testid={`fact-${k}`} className={input} />
              </label>
            ))}
            {DATE_FIELDS.map(([k, label]) => (
              <label key={k} className="text-xs text-ink-600">
                {label}
                <input type="date" value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} data-testid={`fact-${k}`} className={input} />
              </label>
            ))}
          </div>
          {state.inputs && state.inputs.shareholders.length > 0 && (
            <fieldset className="text-xs text-ink-600">
              <legend className="font-medium text-ink-800">Restricted / affiliated holders (excluded from spread and free float — directors, related parties, escrowed parcels)</legend>
              <div className="mt-1 flex flex-wrap gap-2">
                {state.inputs.shareholders.map((s) => {
                  const id = s.id;
                  if (!id) return null;
                  const on = restricted.includes(id);
                  return (
                    <label key={id} className={cn("inline-flex items-center gap-1.5 rounded-lg border px-2 py-1", on ? "border-brand-300 bg-white" : "border-surface-200 bg-white/60")} data-testid="fact-restricted-holder">
                      <input type="checkbox" checked={on} onChange={(e) => setRestricted(e.target.checked ? [...restricted, id] : restricted.filter((x) => x !== id))} />
                      {s.name} <span className="text-ink-400">· {s.role} · {s.sharesHeld.toLocaleString("en-AU")}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}
          <button type="submit" disabled={busy !== null} data-testid="listing-save-facts" className="inline-flex items-center gap-1.5 rounded-lg bg-action px-3 py-1.5 text-xs font-semibold text-on-action hover:bg-action-hover disabled:opacity-60">
            {busy === "save" ? <Loader2 strokeWidth={1.75} className="h-3.5 w-3.5 animate-spin" /> : <Save strokeWidth={1.75} className="h-3.5 w-3.5" />}
            Save facts
          </button>
        </form>
      )}

      <div className="space-y-3" data-testid="listing-rows">
        <h2 className="text-sm font-semibold text-ink-800">{exchangeLabel(state.exchange)}</h2>
        {state.rows.map((r) => (
          <article key={r.id} className="rounded-2xl border border-surface-200 bg-white p-4" data-testid="listing-row" data-status={r.status}>
            <div className="flex flex-wrap items-start gap-2">
              <span className={cn("rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", STATUS_CLASS[r.status])}>{statusLabel(r.status)}</span>
              <p className="flex-1 text-sm font-semibold text-ink-800 min-w-[16rem]">{r.label}</p>
            </div>
            <p className="mt-1 text-[11px] text-ink-400">
              {r.rule} · {r.sourceRef} · checked {r.asAt}
            </p>
            <p className="mt-2 text-xs text-ink-600">
              <span className="font-medium text-ink-700">Basis:</span> {r.basis}
            </p>
            {r.nextStep && (
              <p className="mt-2 text-xs text-brand-700" data-testid="listing-next-step">
                <span className="font-medium">What to do next:</span> {r.nextStep}
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function ScoreCell({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-surface-200 bg-white px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-ink-400">{label}</p>
      <p className="text-lg font-semibold text-ink-900">{value}</p>
      {hint && <p className="text-[10px] text-ink-400">{hint}</p>}
    </div>
  );
}
