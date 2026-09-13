"use client";

/**
 * Shareholder statements panel (S25-B) — sits on /workspace/dividends.
 *
 *   - one card per declared dividend (period, total, franking, tax rate):
 *     "Issue statements (2 credits / included)" with the show-cost-first
 *     preview (who gets a statement, cost, balance) before anything is
 *     charged; register PDF download; "Save to data room" (editor+);
 *   - per-shareholder statement list: number, gross, franking credit, TFN
 *     withheld, issued / voided; download PDF (optionally "prepared for" →
 *     watermark); void with a reason (owner / admin);
 *   - empty state when no dividend has been declared yet.
 *
 * `initial` lets the colocated render test seed the state without a fetch;
 * otherwise the panel loads GET /api/dividends/statements.
 */

import * as React from "react";
import { CheckCircle2, Download, FileText, FolderPlus, Loader2, Receipt, ShieldAlert, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatAudCents, statementCostLabel } from "@/lib/dividends/statement";

export interface StatementListItem {
  id: string;
  statementNo: string;
  recordId: string;
  shareholderName: string;
  role: string;
  sharesHeld: number;
  grossAud: number;
  frankingCreditAud: number;
  tfnWithheldAud: number;
  netPaidAud: number;
  frankingPct: number;
  creditsCharged: number;
  issuedAt: string;
  voidedAt: string | null;
  voidReason: string | null;
  pdfUrl: string;
}

export interface DividendRecordItem {
  id: string;
  period: string;
  createdAt: string;
  paidAt: string | null;
  totalDividendAud: number;
  perShareAud: number;
  companyTaxRate: number;
  frankingPct: number;
  payoutCount: number;
  registerUrl: string;
  statements: StatementListItem[];
}

export interface StatementsPanelState {
  records: DividendRecordItem[];
  role: "owner" | "admin" | "editor" | "viewer" | null;
  cost: number;
  included: boolean;
}

interface Preview {
  recordId: string;
  cost: number;
  included: boolean;
  balance: number | null;
  creditNote: string;
  toIssue: string[];
  alreadyIssued: number;
  company: { name: string; abn: string | null; acn: string | null };
}

const AU_DATE = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Sydney" });
function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : AU_DATE.format(d);
}
export function periodLabel(period: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return period;
  return new Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 15)));
}

export function canIssue(role: StatementsPanelState["role"]): boolean {
  return role === "owner" || role === "admin" || role === "editor";
}
export function canVoid(role: StatementsPanelState["role"]): boolean {
  return role === "owner" || role === "admin";
}

export function DividendStatementsPanel({ initial }: { initial?: StatementsPanelState }) {
  const [state, setState] = React.useState<StatementsPanelState | null>(initial ?? null);
  const [loading, setLoading] = React.useState(!initial);
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [recipient, setRecipient] = React.useState("");

  React.useEffect(() => {
    if (initial) return;
    let alive = true;
    fetch("/api/dividends/statements")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (d?.ok) setState({ records: d.records ?? [], role: d.role ?? null, cost: d.cost ?? 2, included: Boolean(d.included) });
        else setError(d?.error ?? "Could not load dividend statements");
      })
      .catch(() => alive && setError("Network error"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [initial]);

  const post = React.useCallback(async (url: string, body?: unknown) => {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
    const json = await res.json().catch(() => ({}));
    return { res, json };
  }, []);

  const startIssue = React.useCallback(
    async (recordId: string) => {
      setError(null);
      setNotice(null);
      setBusy(`preview:${recordId}`);
      try {
        const { res, json } = await post(`/api/dividends/${recordId}/statements`, {});
        if (!res.ok) {
          setError(
            json.error === "insufficient_credits"
              ? `Not enough credits — ${json.creditsRequired} needed, balance ${json.balance}.`
              : json.error === "no_payouts"
                ? "This dividend has no paying shareholders — record a dividend against your cap table first."
                : json.error ?? "Could not prepare the statements",
          );
          return;
        }
        if (json.preview) {
          setPreview({ recordId, cost: json.cost, included: json.included, balance: json.balance, creditNote: json.creditNote, toIssue: json.toIssue ?? [], alreadyIssued: json.alreadyIssued ?? 0, company: json.company });
        }
      } finally {
        setBusy(null);
      }
    },
    [post],
  );

  const confirmIssue = React.useCallback(async () => {
    if (!preview) return;
    setBusy(`issue:${preview.recordId}`);
    setError(null);
    try {
      const { res, json } = await post(`/api/dividends/${preview.recordId}/statements`, { confirm: true });
      if (!res.ok) {
        setError(json.error ?? "Issue failed");
        return;
      }
      const issued = (json.issued ?? []) as StatementListItem[];
      const existing = (json.existing ?? []) as StatementListItem[];
      setState((s) =>
        s
          ? {
              ...s,
              records: s.records.map((r) => {
                if (r.id !== preview.recordId) return r;
                const known = new Map(r.statements.map((x) => [x.id, x]));
                for (const x of [...existing, ...issued]) known.set(x.id, x);
                return { ...r, statements: [...known.values()].sort((a, b) => a.issuedAt.localeCompare(b.issuedAt)) };
              }),
            }
          : s,
      );
      setPreview(null);
      setNotice(
        issued.length === 0
          ? "Every shareholder already has a live statement — nothing new was issued or charged."
          : `${issued.length} statement${issued.length === 1 ? "" : "s"} issued${json.creditsCharged ? ` — ${json.creditsCharged} credits charged` : " — included in your plan"}.`,
      );
    } finally {
      setBusy(null);
    }
  }, [post, preview]);

  const saveToDataRoom = React.useCallback(
    async (r: DividendRecordItem) => {
      setBusy(`dataroom:${r.id}`);
      setError(null);
      try {
        const { res, json } = await post(`/api/dividends/${r.id}/data-room`);
        if (!res.ok) {
          setError(json.error === "no_statements" ? "Issue the statements first — an empty register is not saved." : json.error ?? "Could not save to the data room");
          return;
        }
        setNotice(`Register and ${json.statements?.length ?? 0} statement${json.statements?.length === 1 ? "" : "s"} for ${periodLabel(r.period)} saved to your data room.`);
      } finally {
        setBusy(null);
      }
    },
    [post],
  );

  const voidOne = React.useCallback(
    async (s: StatementListItem) => {
      const reason = typeof window !== "undefined" ? window.prompt("Reason for voiding this statement (printed on the VOID banner):") : null;
      if (!reason || !reason.trim()) return;
      setBusy(`void:${s.id}`);
      setError(null);
      try {
        const { res, json } = await post(`/api/dividends/statements/${s.id}/void`, { reason: reason.trim() });
        if (!res.ok || !json.statement) {
          setError(json.error ?? "Void failed");
          return;
        }
        setState((st) => (st ? { ...st, records: st.records.map((r) => ({ ...r, statements: r.statements.map((x) => (x.id === s.id ? json.statement : x)) })) } : st));
        setNotice(`Statement ${s.statementNo} voided — issue statements again to replace it.`);
      } finally {
        setBusy(null);
      }
    },
    [post],
  );

  if (loading) return <div className="animate-pulse h-24 bg-surface-100 rounded-2xl" data-testid="statements-panel-loading" />;
  if (!state) {
    return (
      <div className="rounded-2xl border border-surface-200 bg-surface-50 p-4 text-xs text-ink-500" data-testid="statements-panel-error">
        {error ?? "Dividend statements unavailable"}
      </div>
    );
  }

  const issueAllowed = canIssue(state.role);
  const voidAllowed = canVoid(state.role);
  const costLabel = statementCostLabel(state.cost, state.included);
  const withRecipient = (url: string) => (recipient.trim() ? `${url}?for=${encodeURIComponent(recipient.trim())}` : url);

  return (
    <section className="rounded-2xl border border-surface-200 bg-white p-5 md:p-6" data-testid="dividend-statements-panel">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-brand-600 font-semibold flex items-center gap-1.5">
            <Receipt strokeWidth={1.75} className="h-3.5 w-3.5" /> Shareholder statements
          </p>
          <h2 className="mt-1 text-lg font-semibold text-ink-800">Dividend statements &amp; register</h2>
          <p className="mt-1 text-sm text-ink-500 max-w-xl">
            One AU distribution statement per shareholder (franked amount, franking credit, TFN withheld) plus a register for
            your accountant. General information only, not tax advice.
          </p>
        </div>
        {!issueAllowed && state.role ? (
          <p className="text-xs text-ink-400" data-testid="statements-readonly">
            View only — {state.role} on this project cannot issue statements.
          </p>
        ) : null}
      </div>

      {error && (
        <p className="mt-3 text-xs text-red-700" role="alert" data-testid="statements-error">
          {error}
        </p>
      )}
      {notice && (
        <p className="mt-3 text-xs text-emerald-700" data-testid="statements-notice">
          {notice}
        </p>
      )}

      {state.records.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-surface-200 bg-surface-50 px-4 py-8 text-center" data-testid="statements-empty">
          <FileText strokeWidth={1.25} className="mx-auto h-8 w-8 text-muted mb-2" />
          <p className="text-sm text-ink-600">No dividend has been declared yet.</p>
          <p className="text-xs text-ink-400 mt-1">Record a dividend against your cap table and the statements appear here.</p>
        </div>
      ) : (
        <>
          {state.records.some((r) => r.statements.length > 0) && (
            <label className="mt-4 flex flex-wrap items-center gap-2 text-xs text-ink-500">
              <span>Prepare downloads for someone (watermark):</span>
              <input
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="shareholder, accountant or email"
                maxLength={80}
                data-testid="statements-recipient"
                className="rounded-lg border border-surface-200 px-2 py-1 text-xs text-ink-800 w-56"
              />
            </label>
          )}
          <ul className="mt-4 space-y-4" data-testid="dividend-record-list">
            {state.records.map((r) => {
              const live = r.statements.filter((s) => !s.voidedAt).length;
              const isPreview = preview?.recordId === r.id;
              return (
                <li key={r.id} className="rounded-xl border border-surface-200 p-4" data-testid="dividend-record" data-record={r.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-ink-800">Dividend — {periodLabel(r.period)}</p>
                      <p className="text-xs text-ink-500 mt-0.5">
                        {formatAudCents(r.totalDividendAud)} total · A${r.perShareAud.toFixed(6)} per share · {r.frankingPct}% franked · {Math.round(r.companyTaxRate * 100)}% tax rate
                        {r.paidAt ? ` · paid ${fmtDate(r.paidAt)}` : ""} · {live}/{r.payoutCount} statements live
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {issueAllowed && (
                        <button
                          type="button"
                          onClick={() => void startIssue(r.id)}
                          disabled={busy !== null || preview !== null}
                          data-testid="issue-statements"
                          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
                        >
                          {busy === `preview:${r.id}` ? <Loader2 strokeWidth={1.75} className="h-3.5 w-3.5 animate-spin" /> : <Receipt strokeWidth={1.75} className="h-3.5 w-3.5" />}
                          Issue statements ({costLabel})
                        </button>
                      )}
                      <a
                        href={withRecipient(r.registerUrl)}
                        className="inline-flex items-center gap-1 rounded-lg border border-surface-200 px-2.5 py-1.5 text-xs font-medium text-ink-700 hover:bg-surface-50"
                        data-testid="register-pdf"
                      >
                        <Download strokeWidth={1.75} className="h-3.5 w-3.5" /> Register PDF
                      </a>
                      {issueAllowed && live > 0 && (
                        <button
                          type="button"
                          onClick={() => void saveToDataRoom(r)}
                          disabled={busy !== null}
                          data-testid="statements-dataroom"
                          className="inline-flex items-center gap-1 rounded-lg border border-surface-200 px-2.5 py-1.5 text-xs font-medium text-ink-700 hover:bg-surface-50 disabled:opacity-60"
                        >
                          {busy === `dataroom:${r.id}` ? <Loader2 strokeWidth={1.75} className="h-3.5 w-3.5 animate-spin" /> : <FolderPlus strokeWidth={1.75} className="h-3.5 w-3.5" />}
                          Save to data room
                        </button>
                      )}
                    </div>
                  </div>

                  {isPreview && preview && (
                    <div className="mt-3 rounded-xl border border-brand-200 bg-brand-50 p-4" data-testid="statements-preview">
                      <p className="text-sm font-semibold text-ink-800">Confirm before anything is charged</p>
                      <ul className="mt-2 text-xs text-ink-600 space-y-1">
                        <li>
                          Cost: <strong>{preview.included || preview.cost === 0 ? "included" : `${preview.cost} credits`}</strong>
                          {preview.balance !== null && !preview.included ? ` · balance ${preview.balance}` : ""} · {preview.creditNote}
                        </li>
                        <li>
                          Paying entity: {preview.company.name}
                          {preview.company.abn ? ` · ABN ${preview.company.abn}` : " · ABN not supplied"}
                        </li>
                        <li>
                          {preview.toIssue.length > 0 ? `Statements for: ${preview.toIssue.join(", ")}` : "Every shareholder already has a live statement"}
                          {preview.alreadyIssued > 0 ? ` · ${preview.alreadyIssued} already issued (not charged again)` : ""}
                        </li>
                      </ul>
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => void confirmIssue()}
                          disabled={busy !== null}
                          data-testid="confirm-issue-statements"
                          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
                        >
                          {busy === `issue:${r.id}` ? <Loader2 strokeWidth={1.75} className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 strokeWidth={1.75} className="h-3.5 w-3.5" />}
                          {preview.included || preview.cost === 0 ? "Issue (included)" : `Issue for ${preview.cost} credits`}
                        </button>
                        <button type="button" onClick={() => setPreview(null)} disabled={busy !== null} className="rounded-lg border border-surface-200 px-3 py-1.5 text-xs font-medium text-ink-600 hover:bg-surface-50">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  <ul className="mt-3 divide-y divide-surface-100" data-testid="statement-list">
                    {r.statements.length === 0 && (
                      <li className="py-2 text-xs text-ink-400" data-testid="statement-empty">
                        No statements issued for this dividend yet.
                      </li>
                    )}
                    {r.statements.map((s) => {
                      const voided = Boolean(s.voidedAt);
                      return (
                        <li key={s.id} className="py-2.5 flex flex-wrap items-center justify-between gap-3" data-testid="statement-row" data-statement={s.statementNo} data-voided={voided ? "1" : "0"}>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-ink-800 flex items-center gap-2">
                              {s.shareholderName}
                              <span className="font-mono text-xs text-ink-500">{s.statementNo}</span>
                              <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium", voided ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800")}>
                                {voided ? <ShieldAlert strokeWidth={1.75} className="h-3 w-3" /> : <ShieldCheck strokeWidth={1.75} className="h-3 w-3" />}
                                {voided ? "Voided" : "Issued"}
                              </span>
                            </p>
                            <p className="text-xs text-ink-500 mt-0.5">
                              {s.sharesHeld.toLocaleString("en-AU")} shares · gross {formatAudCents(s.grossAud)} · franking credit {formatAudCents(s.frankingCreditAud)}
                              {s.tfnWithheldAud > 0 ? ` · TFN withheld ${formatAudCents(s.tfnWithheldAud)}` : ""} · net {formatAudCents(s.netPaidAud)} · issued {fmtDate(s.issuedAt)}
                              {voided && s.voidReason ? ` · voided: ${s.voidReason}` : ""}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <a
                              href={withRecipient(s.pdfUrl)}
                              className="inline-flex items-center gap-1 rounded-lg border border-surface-200 px-2.5 py-1.5 text-xs font-medium text-ink-700 hover:bg-surface-50"
                              data-testid="statement-pdf"
                            >
                              <Download strokeWidth={1.75} className="h-3.5 w-3.5" /> PDF
                            </a>
                            {voidAllowed && !voided && (
                              <button
                                type="button"
                                onClick={() => void voidOne(s)}
                                disabled={busy !== null}
                                data-testid="statement-void"
                                className="inline-flex items-center gap-1 rounded-lg border border-amber-200 px-2.5 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-60"
                              >
                                {busy === `void:${s.id}` ? <Loader2 strokeWidth={1.75} className="h-3.5 w-3.5 animate-spin" /> : <ShieldAlert strokeWidth={1.75} className="h-3.5 w-3.5" />}
                                Void
                              </button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
