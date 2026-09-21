"use client";

/**
 * DRIP panel (S28-A) — dividend reinvestment plan on /workspace/finance/dividends.
 *
 *   - elections table: shareholder, participation %, price basis (S26-B
 *     share price mid / manual plan price), elected / revoked; revoke
 *     (editor+);
 *   - add / replace an election (editor+): cap-table shareholder,
 *     participation 0–100 %, price basis, manual price;
 *   - preview of the NEXT allocation for the newest dividend still to
 *     issue: estimated shares, amount reinvested, cash — at the price each
 *     election would use (nothing is written until statements are issued);
 *   - allocations made so far with the share-issue board resolution link;
 *   - the notice: DRIP shares are issued under the company's constitution /
 *     shareholders' agreement (the plan rules), the allotment needs the
 *     directors' resolution and ASIC must be notified of the share issue
 *     (s 254X, Form 484, within 28 days).
 *
 * `initial` lets the colocated render test seed the state without a fetch;
 * otherwise the panel loads GET /api/dividends/drip/elections.
 */

import * as React from "react";
import { Loader2, PlusCircle, Repeat, ShieldAlert, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatAudCents } from "@/lib/dividends/statement";
import { dripSkipLabel, formatSharePriceAud, type DripPriceBasis, type DripSkipReason } from "@/lib/dividends/drip";
import { BoardResolutionButton } from "@/components/board-resolutions/board-resolution-button";
import { ApiError, userErrorMessage } from "@/lib/ui/user-error";

export interface DripElectionItem {
  id: string;
  shareholderId: string;
  shareholderName: string;
  role: string | null;
  sharesHeld: number;
  participationPct: number;
  priceBasis: DripPriceBasis;
  manualPriceAud: number | null;
  electedAt: string;
  revokedAt: string | null;
  active: boolean;
}

export interface DripAllocationItem {
  id: string;
  recordId: string;
  shareholderName: string;
  status: "recorded" | "skipped";
  skipReason: string | null;
  participationPct: number;
  priceAud: number;
  shares: number;
  reinvestedAud: number;
  residualAud: number;
  shareTransactionId: string | null;
  createdAt: string;
}

export interface DripPreviewRow {
  electionId: string;
  shareholderName: string;
  participationPct: number;
  priceBasis: DripPriceBasis;
  priceAud: number;
  netCashAud: number;
  estShares: number;
  estReinvestedAud: number;
  estResidualAud: number;
  estCashPaidAud: number;
  skipReason: DripSkipReason | null;
}

export interface DripPanelState {
  role: "owner" | "admin" | "editor" | "viewer" | null;
  elections: DripElectionItem[];
  allocations: DripAllocationItem[];
  shareholders: Array<{ id: string; name: string; role: string; sharesHeld: number; electing: boolean }>;
  marketPriceAud: number | null;
  preview: { recordId: string; period: string; totalDividendAud: number; rows: DripPreviewRow[] } | null;
}

const AU_DATE = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Sydney" });
function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : AU_DATE.format(d);
}

export function canManageDrip(role: DripPanelState["role"]): boolean {
  return role === "owner" || role === "admin" || role === "editor";
}

export function priceBasisLabel(basis: DripPriceBasis, manual: number | null): string {
  return basis === "manual" ? `plan price ${formatSharePriceAud(manual ?? 0)}` : "share price (mid) at issue";
}

export const DRIP_NOTICE =
  "DRIP shares are issued under the company's constitution and shareholders' agreement (the plan rules) — check both allow a reinvestment plan before relying on it. Each allotment is recorded on the cap table when the statements are issued and still needs the directors' share-issue resolution; the company must notify ASIC of the share issue (Corporations Act s 254X, Form 484) within 28 days. The reinvested amount stays a dividend for tax purposes. General information, not legal or tax advice.";

interface Draft {
  shareholderId: string;
  participationPct: string;
  priceBasis: DripPriceBasis;
  manualPriceAud: string;
}

const EMPTY_DRAFT: Draft = { shareholderId: "", participationPct: "100", priceBasis: "share_price_mid", manualPriceAud: "" };

export function DripPanel({ initial }: { initial?: DripPanelState }) {
  const [state, setState] = React.useState<DripPanelState | null>(initial ?? null);
  const [loading, setLoading] = React.useState(!initial);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<Draft>(EMPTY_DRAFT);
  const [adding, setAdding] = React.useState(false);

  const apply = React.useCallback((d: Record<string, unknown> | null) => {
    if (d?.ok) {
      const s = d as unknown as DripPanelState;
      setState({ role: s.role ?? null, elections: s.elections ?? [], allocations: s.allocations ?? [], shareholders: s.shareholders ?? [], marketPriceAud: s.marketPriceAud ?? null, preview: s.preview ?? null });
    } else setError((d?.error as string | undefined) ?? "Could not load the DRIP");
  }, []);

  React.useEffect(() => {
    if (initial) return;
    let alive = true;
    fetch("/api/dividends/drip/elections")
      .then((r) => r.json())
      .then((d) => alive && apply(d))
      .catch(() => alive && setError("Network error"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [initial, apply]);

  /** User-triggered reload (after add / revoke). */
  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/dividends/drip/elections");
      apply(await res.json().catch(() => null));
    } catch {
      setError("Network error");
    }
  }, [apply]);

  const submit = React.useCallback(async () => {
    setError(null);
    setNotice(null);
    setBusy("add");
    try {
      const res = await fetch("/api/dividends/drip/elections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shareholderId: draft.shareholderId, participationPct: Number(draft.participationPct), priceBasis: draft.priceBasis, manualPriceAud: draft.priceBasis === "manual" ? Number(draft.manualPriceAud) : undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(userErrorMessage(ApiError.fromBody(res.status, json), "Could not record the election"));
        return;
      }
      setNotice(`${json.election?.shareholderName ?? "Shareholder"} now reinvests ${json.election?.participationPct ?? ""}% of each dividend${json.replaced ? " (previous election replaced)" : ""}.`);
      setAdding(false);
      setDraft(EMPTY_DRAFT);
      await load();
    } finally {
      setBusy(null);
    }
  }, [draft, load]);

  const revoke = React.useCallback(
    async (e: DripElectionItem) => {
      setError(null);
      setNotice(null);
      setBusy(`revoke:${e.id}`);
      try {
        const res = await fetch("/api/dividends/drip/elections", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: e.id }) });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(userErrorMessage(ApiError.fromBody(res.status, json), "Could not revoke the election"));
          return;
        }
        setNotice(`${e.shareholderName}'s election revoked — future dividends are paid in cash.`);
        await load();
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  if (loading && !state) return <div className="animate-pulse h-24 bg-surface-100 rounded-2xl" data-testid="drip-panel-loading" />;
  if (!state) {
    return (
      <div className="rounded-2xl border border-surface-200 bg-surface-50 p-4 text-xs text-ink-500" data-testid="drip-panel-error">
        {error ?? "DRIP unavailable"}
      </div>
    );
  }

  const allowed = canManageDrip(state.role);
  const active = state.elections.filter((e) => e.active);
  const electable = state.shareholders.filter((s) => !s.electing);
  const draftValid = Boolean(draft.shareholderId) && Number.isFinite(Number(draft.participationPct)) && Number(draft.participationPct) >= 0 && Number(draft.participationPct) <= 100 && (draft.priceBasis !== "manual" || Number(draft.manualPriceAud) > 0);

  return (
    <section className="rounded-2xl border border-surface-200 bg-white p-5 md:p-6" data-testid="drip-panel">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-brand-600 font-semibold flex items-center gap-1.5">
            <Repeat strokeWidth={1.75} className="h-3.5 w-3.5" /> Dividend reinvestment plan
          </p>
          <h2 className="mt-1 text-lg font-semibold text-ink-800">DRIP elections</h2>
          <p className="mt-1 text-sm text-ink-500 max-w-xl">Shareholders who elect in have part of each net dividend applied to new shares when the statements are issued; whole shares only, the residual is paid in cash.</p>
        </div>
        <p className="text-xs text-ink-500" data-testid="drip-market-price">
          {state.marketPriceAud ? `Current share price (mid): ${formatSharePriceAud(state.marketPriceAud)}` : active.some((e) => e.priceBasis === "share_price_mid") ? "No usable share price yet — mid-price elections pay cash until a valuation exists." : ""}
        </p>
      </div>

      <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 flex gap-2" data-testid="drip-notice">
        <ShieldAlert strokeWidth={1.75} className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>{DRIP_NOTICE}</span>
      </p>

      {error && (
        <p className="mt-3 text-xs text-red-700" role="alert" data-testid="drip-error">
          {error}
        </p>
      )}
      {notice && (
        <p className="mt-3 text-xs text-emerald-700" data-testid="drip-notice-ok">
          {notice}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink-800">Elections</p>
        {allowed && electable.length > 0 && !adding && (
          <button type="button" onClick={() => setAdding(true)} disabled={busy !== null} data-testid="drip-add" className="inline-flex items-center gap-1.5 rounded-lg bg-action px-3 py-1.5 text-xs font-semibold text-white hover:bg-action-hover disabled:opacity-60">
            <PlusCircle strokeWidth={1.75} className="h-3.5 w-3.5" /> Add election
          </button>
        )}
        {!allowed && state.role ? (
          <p className="text-xs text-ink-400" data-testid="drip-readonly">
            View only — {state.role} on this project cannot change elections.
          </p>
        ) : null}
      </div>

      {adding && allowed && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="mt-3 grid gap-2 rounded-xl border border-brand-200 bg-brand-50 p-4 sm:grid-cols-2 lg:grid-cols-4"
          data-testid="drip-form"
        >
          <label className="text-xs text-ink-600">
            Shareholder
            <select value={draft.shareholderId} onChange={(e) => setDraft({ ...draft, shareholderId: e.target.value })} required data-testid="drip-shareholder" className="mt-1 w-full rounded-lg border border-surface-200 bg-white px-2 py-1.5 text-xs text-ink-800">
              <option value="">Choose…</option>
              {electable.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.sharesHeld.toLocaleString("en-AU")} shares
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-ink-600">
            Participation %
            <input type="number" min={0} max={100} step={0.01} value={draft.participationPct} onChange={(e) => setDraft({ ...draft, participationPct: e.target.value })} required data-testid="drip-pct" className="mt-1 w-full rounded-lg border border-surface-200 bg-white px-2 py-1.5 text-xs text-ink-800" />
          </label>
          <label className="text-xs text-ink-600">
            Price basis
            <select value={draft.priceBasis} onChange={(e) => setDraft({ ...draft, priceBasis: e.target.value as DripPriceBasis })} data-testid="drip-basis" className="mt-1 w-full rounded-lg border border-surface-200 bg-white px-2 py-1.5 text-xs text-ink-800">
              <option value="share_price_mid">Share price (mid) at issue</option>
              <option value="manual">Manual plan price</option>
            </select>
          </label>
          <label className="text-xs text-ink-600">
            Manual price (A$ per share)
            <input type="number" min={0} step={0.000001} value={draft.manualPriceAud} onChange={(e) => setDraft({ ...draft, manualPriceAud: e.target.value })} disabled={draft.priceBasis !== "manual"} required={draft.priceBasis === "manual"} data-testid="drip-manual-price" className="mt-1 w-full rounded-lg border border-surface-200 bg-white px-2 py-1.5 text-xs text-ink-800 disabled:opacity-50" />
          </label>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
            <button type="submit" disabled={busy !== null || !draftValid} data-testid="drip-save" className="inline-flex items-center gap-1.5 rounded-lg bg-action px-3 py-1.5 text-xs font-semibold text-white hover:bg-action-hover disabled:opacity-60">
              {busy === "add" ? <Loader2 strokeWidth={1.75} className="h-3.5 w-3.5 animate-spin" /> : <PlusCircle strokeWidth={1.75} className="h-3.5 w-3.5" />}
              Save election
            </button>
            <button type="button" onClick={() => setAdding(false)} disabled={busy !== null} className="rounded-lg border border-surface-200 px-3 py-1.5 text-xs font-medium text-ink-600 hover:bg-surface-50">
              Cancel
            </button>
          </div>
        </form>
      )}

      <ul className="mt-2 divide-y divide-surface-100" data-testid="drip-election-list">
        {state.elections.length === 0 && (
          <li className="py-2 text-xs text-ink-400" data-testid="drip-election-empty">
            No shareholder has elected into the DRIP yet — every dividend is paid in cash.
          </li>
        )}
        {state.elections.map((e) => (
          <li key={e.id} className="py-2.5 flex flex-wrap items-center justify-between gap-3" data-testid="drip-election-row" data-active={e.active ? "1" : "0"}>
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink-800 flex items-center gap-2">
                {e.shareholderName}
                <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium", e.active ? "bg-emerald-100 text-emerald-800" : "bg-surface-100 text-ink-500")}>{e.active ? "Active" : "Revoked"}</span>
              </p>
              <p className="text-xs text-ink-500 mt-0.5">
                {e.participationPct}% of each net dividend · {priceBasisLabel(e.priceBasis, e.manualPriceAud)} · elected {fmtDate(e.electedAt)}
                {e.revokedAt ? ` · revoked ${fmtDate(e.revokedAt)}` : ""}
              </p>
            </div>
            {allowed && e.active && (
              <button type="button" onClick={() => void revoke(e)} disabled={busy !== null} data-testid="drip-revoke" className="inline-flex items-center gap-1 rounded-lg border border-amber-200 px-2.5 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-60">
                {busy === `revoke:${e.id}` ? <Loader2 strokeWidth={1.75} className="h-3.5 w-3.5 animate-spin" /> : <XCircle strokeWidth={1.75} className="h-3.5 w-3.5" />}
                Revoke
              </button>
            )}
          </li>
        ))}
      </ul>

      {state.preview && (
        <div className="mt-4" data-testid="drip-preview">
          <p className="text-sm font-semibold text-ink-800">Next allocation — dividend {state.preview.period}</p>
          <p className="text-xs text-ink-500">Estimated when the statements for this dividend are issued ({formatAudCents(state.preview.totalDividendAud)} declared). Nothing is allotted until then.</p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-ink-400">
                  <th className="py-1.5 pr-3">Shareholder</th>
                  <th className="py-1.5 pr-3 text-right">Net cash</th>
                  <th className="py-1.5 pr-3 text-right">Reinvest %</th>
                  <th className="py-1.5 pr-3 text-right">Price</th>
                  <th className="py-1.5 pr-3 text-right">Shares</th>
                  <th className="py-1.5 pr-3 text-right">Reinvested</th>
                  <th className="py-1.5 text-right">Cash paid</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {state.preview.rows.map((r) => (
                  <tr key={r.electionId} data-testid="drip-preview-row">
                    <td className="py-1.5 pr-3 font-medium text-ink-800">{r.shareholderName}</td>
                    <td className="py-1.5 pr-3 text-right">{formatAudCents(r.netCashAud)}</td>
                    <td className="py-1.5 pr-3 text-right">{r.participationPct}%</td>
                    <td className="py-1.5 pr-3 text-right">{r.priceAud > 0 ? formatSharePriceAud(r.priceAud) : "—"}</td>
                    <td className="py-1.5 pr-3 text-right">{r.estShares.toLocaleString("en-AU")}</td>
                    <td className="py-1.5 pr-3 text-right">{formatAudCents(r.estReinvestedAud)}</td>
                    <td className="py-1.5 text-right">
                      {formatAudCents(r.estCashPaidAud)}
                      {r.skipReason ? <span className="ml-1 text-amber-700">({dripSkipLabel(r.skipReason)})</span> : ""}
                    </td>
                  </tr>
                ))}
                {state.preview.rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-2 text-ink-400">
                      No electing shareholder is paid under this dividend.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {state.allocations.length > 0 && (
        <div className="mt-4" data-testid="drip-allocations">
          <p className="text-sm font-semibold text-ink-800">Allocations made</p>
          <ul className="mt-1 divide-y divide-surface-100">
            {state.allocations.map((a) => (
              <li key={a.id} className="py-2 flex flex-wrap items-center justify-between gap-3" data-testid="drip-allocation-row" data-status={a.status}>
                <p className="text-xs text-ink-600">
                  <span className="font-medium text-ink-800">{a.shareholderName}</span>
                  {a.status === "recorded" ? ` · ${a.shares.toLocaleString("en-AU")} shares at ${formatSharePriceAud(a.priceAud)} · ${formatAudCents(a.reinvestedAud)} reinvested · residual ${formatAudCents(a.residualAud)} in cash` : ` · paid in cash (${a.skipReason ?? "skipped"})`} · {fmtDate(a.createdAt)}
                </p>
                {a.shareTransactionId && (
                  <BoardResolutionButton kind="share-issue" recordId={a.shareTransactionId} label={`DRIP — ${a.shares.toLocaleString("en-AU")} shares to ${a.shareholderName}`} canGenerate={allowed} onNotice={setNotice} />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
