"use client";

/**
 * Annual tax statements panel (S28-A) — sits on /workspace/finance/dividends under
 * the distribution statements.
 *
 *   - FY picker (Australian financial year, 1 Jul – 30 Jun; default = the
 *     last completed year) with the per-shareholder FY summary built from
 *     the live distribution statements paid inside the year;
 *   - "Generate statements (2 credits per financial year / included)" with
 *     the show-cost-first preview (who gets one, cost, balance) before
 *     anything is charged; "Regenerate" (new version, old one superseded);
 *   - the generated statements: number, version, totals, PDF link
 *     (optionally "prepared for" → watermark); "Save to data room" (editor+);
 *   - the standard wording: amounts may be reported to the ATO; include the
 *     franking credits as assessable income and claim the offset — general
 *     information, not tax advice.
 *
 * `initial` lets the colocated render test seed the state without a fetch;
 * otherwise the panel loads GET /api/dividends/tax-statements?fy=.
 */

import * as React from "react";
import { CalendarRange, CheckCircle2, Download, FileText, FolderPlus, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatAudCents } from "@/lib/dividends/statement";
import { taxStatementCostLabel } from "@/lib/dividends/fy-summary";
import { ApiError, userErrorMessage } from "@/lib/ui/user-error";

export interface FyShareholderRow {
  key: string;
  name: string;
  role: string;
  totals: { grossAud: number; frankedAud: number; unfrankedAud: number; frankingCreditAud: number; tfnWithheldAud: number; netPaidAud: number; grossedUpAud: number; distributions: number; dripShares: number; dripReinvestedAud: number };
}

export interface TaxStatementItem {
  id: string;
  statementNo: string;
  fy: string;
  version: number;
  current: boolean;
  shareholderName: string;
  role: string;
  distributions: number;
  grossAud: number;
  frankedAud: number;
  unfrankedAud: number;
  frankingCreditAud: number;
  tfnWithheldAud: number;
  netPaidAud: number;
  grossedUpAud: number;
  dripShares: number;
  creditsCharged: number;
  issuedAt: string;
  pdfUrl: string;
}

export interface TaxStatementsPanelState {
  fy: string;
  options: string[];
  role: "owner" | "admin" | "editor" | "viewer" | null;
  /** What THIS caller pays per FY run — 0 when included (lane-2 P3-e: same key semantics as the POST preview). */
  cost: number;
  /** Catalogue price of a run (2 credits). */
  listedCost: number;
  included: boolean;
  excluded: { voided: number; outsideFy: number; undated: number };
  shareholders: FyShareholderRow[];
  statements: TaxStatementItem[];
}

interface Preview {
  fy: string;
  cost: number;
  included: boolean;
  balance: number | null;
  creditNote: string;
  toGenerate: string[];
  alreadyGenerated: number;
  regenerate: boolean;
  /** S29-hardening: the run stamp when this regenerate completes a partial run (free, only the missing shareholders). */
  retryOfRun: string | null;
  company: { name: string; abn: string | null };
}

const AU_DATE = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Sydney" });
function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : AU_DATE.format(d);
}

export function fyRange(fy: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(fy);
  if (!m) return fy;
  return `1 Jul ${m[1]} – 30 Jun ${Number(m[1]) + 1}`;
}

export function canGenerate(role: TaxStatementsPanelState["role"]): boolean {
  return role === "owner" || role === "admin" || role === "editor";
}

export const TAX_PANEL_ATO_LINE =
  "These amounts may be reported to the ATO. Shareholders include the franked and unfranked dividends and the franking credits as assessable income and claim the franking credits as a tax offset — general information, not tax advice.";

export function AnnualTaxStatementsPanel({ initial }: { initial?: TaxStatementsPanelState }) {
  const [state, setState] = React.useState<TaxStatementsPanelState | null>(initial ?? null);
  const [loading, setLoading] = React.useState(!initial);
  const [fy, setFy] = React.useState<string | null>(initial?.fy ?? null);
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [recipient, setRecipient] = React.useState("");

  const apply = React.useCallback((d: Record<string, unknown> | null) => {
    if (d?.ok) {
      const s = d as unknown as TaxStatementsPanelState & { included: unknown };
      const listedCost = typeof s.listedCost === "number" ? s.listedCost : 2;
      const included = Boolean(s.included);
      // An included caller is never shown the catalogue price as their cost.
      const cost = included ? 0 : typeof s.cost === "number" ? s.cost : listedCost;
      setState({ fy: s.fy, options: s.options ?? [], role: s.role ?? null, cost, listedCost, included, excluded: s.excluded ?? { voided: 0, outsideFy: 0, undated: 0 }, shareholders: s.shareholders ?? [], statements: s.statements ?? [] });
      setFy(s.fy);
    } else setError((d?.error as string | undefined) ?? "Could not load annual tax statements");
  }, []);

  const url = (which: string | null) => `/api/dividends/tax-statements${which ? `?fy=${encodeURIComponent(which)}` : ""}`;

  React.useEffect(() => {
    if (initial) return;
    let alive = true;
    fetch(url(null))
      .then((r) => r.json())
      .then((d) => alive && apply(d))
      .catch(() => alive && setError("Network error"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [initial, apply]);

  /** User-triggered reload (FY picker, after a generate). */
  const load = React.useCallback(
    async (which: string | null) => {
      setLoading(true);
      try {
        const res = await fetch(url(which));
        apply(await res.json().catch(() => null));
      } catch {
        setError("Network error");
      } finally {
        setLoading(false);
      }
    },
    [apply],
  );

  const post = React.useCallback(async (url: string, body?: unknown) => {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
    const json = await res.json().catch(() => ({}));
    return { res, json };
  }, []);

  const startGenerate = React.useCallback(
    async (regenerate: boolean) => {
      if (!fy) return;
      setError(null);
      setNotice(null);
      setBusy("preview");
      try {
        const { res, json } = await post("/api/dividends/tax-statements", { fy, regenerate });
        if (!res.ok) {
          setError(
            json.error === "insufficient_credits"
              ? `Not enough credits — ${json.creditsRequired} needed, balance ${json.balance}.`
              : json.error === "no_statements"
                ? `No distribution statement was paid in FY ${fy} — issue the dividend statements first.`
                : json.error ?? "Could not prepare the statements",
          );
          return;
        }
        if (json.preview) setPreview({ fy: json.fy, cost: json.cost, included: json.included, balance: json.balance, creditNote: json.creditNote, toGenerate: json.toGenerate ?? [], alreadyGenerated: json.alreadyGenerated ?? 0, regenerate: Boolean(json.regenerate), retryOfRun: typeof json.retryOfRun === "string" ? json.retryOfRun : null, company: json.company });
      } finally {
        setBusy(null);
      }
    },
    [fy, post],
  );

  const confirmGenerate = React.useCallback(async () => {
    if (!preview) return;
    setBusy("generate");
    setError(null);
    try {
      const { res, json } = await post("/api/dividends/tax-statements", { fy: preview.fy, regenerate: preview.regenerate, confirm: true });
      if (!res.ok) {
        setError(userErrorMessage(ApiError.fromBody(res.status, json), "Generation failed"));
        return;
      }
      setPreview(null);
      setNotice(
        json.generatedCount === 0
          ? "Every shareholder already has a current statement for this year — nothing new was generated or charged."
          : `${json.generatedCount} annual statement${json.generatedCount === 1 ? "" : "s"} generated for FY ${preview.fy}${json.creditsCharged ? ` — ${json.creditsCharged} credits charged` : " — included in your plan"}${json.superseded?.length ? ` · ${json.superseded.length} previous version${json.superseded.length === 1 ? "" : "s"} superseded` : ""}.`,
      );
      await load(preview.fy);
    } finally {
      setBusy(null);
    }
  }, [load, post, preview]);

  const saveToDataRoom = React.useCallback(async () => {
    if (!fy) return;
    setBusy("dataroom");
    setError(null);
    try {
      const { res, json } = await post("/api/dividends/tax-statements/data-room", { fy });
      if (!res.ok) {
        setError(json.error === "no_statements" ? "Generate the statements first — there is nothing to save yet." : json.error ?? "Could not save to the data room");
        return;
      }
      setNotice(`${json.statements?.length ?? 0} annual statement${json.statements?.length === 1 ? "" : "s"} for FY ${fy} saved to your data room.`);
    } finally {
      setBusy(null);
    }
  }, [fy, post]);

  if (loading && !state) return <div className="animate-pulse h-24 bg-surface-100 rounded-2xl" data-testid="tax-panel-loading" />;
  if (!state) {
    return (
      <div className="rounded-2xl border border-surface-200 bg-surface-50 p-4 text-xs text-ink-500" data-testid="tax-panel-error">
        {error ?? "Annual tax statements unavailable"}
      </div>
    );
  }

  const allowed = canGenerate(state.role);
  const current = state.statements.filter((s) => s.current);
  const costLabel = taxStatementCostLabel(state.cost, state.included);
  const withRecipient = (url: string) => (recipient.trim() ? `${url}?for=${encodeURIComponent(recipient.trim())}` : url);

  return (
    <section className="rounded-2xl border border-surface-200 bg-white p-5 md:p-6" data-testid="annual-tax-statements-panel">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-brand-600 font-semibold flex items-center gap-1.5">
            <CalendarRange strokeWidth={1.75} className="h-3.5 w-3.5" /> Annual tax statements
          </p>
          <h2 className="mt-1 text-lg font-semibold text-ink-800">Shareholder tax statements by financial year</h2>
          <p className="mt-1 text-sm text-ink-500 max-w-xl">One summary per shareholder for the year (1 July – 30 June): franked and unfranked dividends, franking credits, TFN withheld and every payment date.</p>
        </div>
        <label className="flex items-center gap-2 text-xs text-ink-500">
          <span>Financial year</span>
          <select
            value={fy ?? state.fy}
            onChange={(e) => {
              setPreview(null);
              setNotice(null);
              setError(null);
              void load(e.target.value);
            }}
            disabled={busy !== null}
            data-testid="tax-fy-picker"
            className="rounded-lg border border-surface-200 px-2 py-1 text-xs text-ink-800"
          >
            {state.options.map((o) => (
              <option key={o} value={o}>
                {o} ({fyRange(o)})
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="mt-3 text-[11px] text-ink-500 max-w-2xl" data-testid="tax-ato-line">
        {TAX_PANEL_ATO_LINE}
      </p>

      {error && (
        <p className="mt-3 text-xs text-red-700" role="alert" data-testid="tax-error">
          {error}
        </p>
      )}
      {notice && (
        <p className="mt-3 text-xs text-emerald-700" data-testid="tax-notice">
          {notice}
        </p>
      )}

      {state.shareholders.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-surface-200 bg-surface-50 px-4 py-8 text-center" data-testid="tax-empty">
          <FileText strokeWidth={1.25} className="mx-auto h-8 w-8 text-muted mb-2" />
          <p className="text-sm text-ink-600">No distribution statement was paid in FY {state.fy}.</p>
          <p className="text-xs text-ink-400 mt-1">Issue the dividend statements above — the annual summaries are built from them.</p>
        </div>
      ) : (
        <>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs" data-testid="tax-fy-summary">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-ink-400">
                  <th className="py-1.5 pr-3">Shareholder</th>
                  <th className="py-1.5 pr-3 text-right">Distributions</th>
                  <th className="py-1.5 pr-3 text-right">Franked</th>
                  <th className="py-1.5 pr-3 text-right">Unfranked</th>
                  <th className="py-1.5 pr-3 text-right">Franking credits</th>
                  <th className="py-1.5 pr-3 text-right">TFN withheld</th>
                  <th className="py-1.5 pr-3 text-right">Net cash</th>
                  <th className="py-1.5 text-right">Assessable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {state.shareholders.map((s) => (
                  <tr key={s.key} data-testid="tax-fy-row" data-shareholder={s.name}>
                    <td className="py-1.5 pr-3 font-medium text-ink-800">
                      {s.name} <span className="text-ink-400">· {s.role}</span>
                    </td>
                    <td className="py-1.5 pr-3 text-right">{s.totals.distributions}</td>
                    <td className="py-1.5 pr-3 text-right">{formatAudCents(s.totals.frankedAud)}</td>
                    <td className="py-1.5 pr-3 text-right">{formatAudCents(s.totals.unfrankedAud)}</td>
                    <td className="py-1.5 pr-3 text-right">{formatAudCents(s.totals.frankingCreditAud)}</td>
                    <td className="py-1.5 pr-3 text-right">{formatAudCents(s.totals.tfnWithheldAud)}</td>
                    <td className="py-1.5 pr-3 text-right">{formatAudCents(s.totals.netPaidAud)}</td>
                    <td className="py-1.5 text-right font-semibold">{formatAudCents(s.totals.grossedUpAud)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {state.excluded.voided + state.excluded.outsideFy > 0 ? (
            <p className="mt-1 text-[11px] text-ink-400" data-testid="tax-excluded">
              Not counted: {state.excluded.voided} voided · {state.excluded.outsideFy} paid outside the year.
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            {allowed && (
              <button
                type="button"
                onClick={() => void startGenerate(false)}
                disabled={busy !== null || preview !== null}
                data-testid="generate-tax-statements"
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
              >
                {busy === "preview" ? <Loader2 strokeWidth={1.75} className="h-3.5 w-3.5 animate-spin" /> : <FileText strokeWidth={1.75} className="h-3.5 w-3.5" />}
                Generate statements ({costLabel})
              </button>
            )}
            {allowed && current.length > 0 && (
              <button
                type="button"
                onClick={() => void startGenerate(true)}
                disabled={busy !== null || preview !== null}
                data-testid="regenerate-tax-statements"
                className="inline-flex items-center gap-1 rounded-lg border border-surface-200 px-2.5 py-1.5 text-xs font-medium text-ink-700 hover:bg-surface-50 disabled:opacity-60"
              >
                <RefreshCw strokeWidth={1.75} className="h-3.5 w-3.5" /> Regenerate (new version)
              </button>
            )}
            {allowed && current.length > 0 && (
              <button
                type="button"
                onClick={() => void saveToDataRoom()}
                disabled={busy !== null}
                data-testid="tax-dataroom"
                className="inline-flex items-center gap-1 rounded-lg border border-surface-200 px-2.5 py-1.5 text-xs font-medium text-ink-700 hover:bg-surface-50 disabled:opacity-60"
              >
                {busy === "dataroom" ? <Loader2 strokeWidth={1.75} className="h-3.5 w-3.5 animate-spin" /> : <FolderPlus strokeWidth={1.75} className="h-3.5 w-3.5" />}
                Save to data room
              </button>
            )}
            {!allowed && state.role ? (
              <p className="text-xs text-ink-400" data-testid="tax-readonly">
                View only — {state.role} on this project cannot generate statements.
              </p>
            ) : null}
          </div>

          {preview && (
            <div className="mt-3 rounded-xl border border-brand-200 bg-brand-50 p-4" data-testid="tax-preview">
              <p className="text-sm font-semibold text-ink-800">Confirm before anything is charged</p>
              <ul className="mt-2 text-xs text-ink-600 space-y-1">
                <li>
                  Cost: <strong>{preview.included || preview.cost === 0 ? "included" : `${preview.cost} credits for this financial-year run`}</strong>
                  {preview.balance !== null && !preview.included ? ` · balance ${preview.balance}` : ""} · {preview.creditNote}
                </li>
                <li>
                  Reporting entity: {preview.company.name}
                  {preview.company.abn ? ` · ABN ${preview.company.abn}` : " · ABN not supplied"}
                </li>
                <li>
                  {preview.toGenerate.length > 0 ? `Statements for: ${preview.toGenerate.join(", ")}` : "Every shareholder already has a current statement"}
                  {preview.retryOfRun
                    ? " · completes the last regenerate run, which did not reach everyone (not charged again)"
                    : preview.alreadyGenerated > 0 ? (preview.regenerate ? ` · ${preview.alreadyGenerated} current statement${preview.alreadyGenerated === 1 ? "" : "s"} will be superseded by a new version` : ` · ${preview.alreadyGenerated} already generated (not charged again)`) : ""}
                </li>
              </ul>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => void confirmGenerate()}
                  disabled={busy !== null}
                  data-testid="confirm-generate-tax-statements"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
                >
                  {busy === "generate" ? <Loader2 strokeWidth={1.75} className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 strokeWidth={1.75} className="h-3.5 w-3.5" />}
                  {preview.included || preview.cost === 0 ? "Generate (included)" : `Generate for ${preview.cost} credits`}
                </button>
                <button type="button" onClick={() => setPreview(null)} disabled={busy !== null} className="rounded-lg border border-surface-200 px-3 py-1.5 text-xs font-medium text-ink-600 hover:bg-surface-50">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {state.statements.length > 0 && (
            <label className="mt-4 flex flex-wrap items-center gap-2 text-xs text-ink-500">
              <span>Prepare downloads for someone (watermark):</span>
              <input type="text" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="shareholder, accountant or email" maxLength={80} data-testid="tax-recipient" className="rounded-lg border border-surface-200 px-2 py-1 text-xs text-ink-800 w-56" />
            </label>
          )}
          <ul className="mt-3 divide-y divide-surface-100" data-testid="tax-statement-list">
            {state.statements.length === 0 && (
              <li className="py-2 text-xs text-ink-400" data-testid="tax-statement-empty">
                No annual statement generated for FY {state.fy} yet.
              </li>
            )}
            {state.statements.map((s) => (
              <li key={s.id} className="py-2.5 flex flex-wrap items-center justify-between gap-3" data-testid="tax-statement-row" data-statement={s.statementNo} data-current={s.current ? "1" : "0"}>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-800 flex items-center gap-2">
                    {s.shareholderName}
                    <span className="font-mono text-xs text-ink-500">{s.statementNo}</span>
                    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium", s.current ? "bg-emerald-100 text-emerald-800" : "bg-surface-100 text-ink-500")}>{s.current ? `v${s.version} · current` : `v${s.version} · superseded`}</span>
                  </p>
                  <p className="text-xs text-ink-500 mt-0.5">
                    {s.distributions} distribution{s.distributions === 1 ? "" : "s"} · franked {formatAudCents(s.frankedAud)} · unfranked {formatAudCents(s.unfrankedAud)} · franking credits {formatAudCents(s.frankingCreditAud)}
                    {s.tfnWithheldAud > 0 ? ` · TFN withheld ${formatAudCents(s.tfnWithheldAud)}` : ""} · assessable {formatAudCents(s.grossedUpAud)}
                    {s.dripShares > 0 ? ` · DRIP ${s.dripShares.toLocaleString("en-AU")} shares` : ""} · generated {fmtDate(s.issuedAt)}
                  </p>
                </div>
                <a href={withRecipient(s.pdfUrl)} className="inline-flex items-center gap-1 rounded-lg border border-surface-200 px-2.5 py-1.5 text-xs font-medium text-ink-700 hover:bg-surface-50" data-testid="tax-statement-pdf">
                  <Download strokeWidth={1.75} className="h-3.5 w-3.5" /> PDF
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
