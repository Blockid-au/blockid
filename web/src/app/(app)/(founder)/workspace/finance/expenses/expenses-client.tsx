"use client";

/**
 * /workspace/finance/expenses (S28-C) — bank CSV upload → categorised lines.
 *
 *   - upload card (CSV ≤ 5 MB; ANZ / CBA / NAB / Westpac / generic) with
 *     the import result (stored / duplicates / placed by rules / left for AI);
 *   - "Categorise N rows with AI (cost: X credits)" — the price is shown
 *     BEFORE anything runs: preview → confirm panel (cost, balance, who is
 *     charged) → run; Growth+ sees "included in your plan";
 *   - summary tiles (spend, burn rate, income, net, GST estimate flagged,
 *     lines to review) + a monthly stacked SVG bar chart by category;
 *   - review table, needs-review rows first, inline category select →
 *     PATCH /api/expenses/[id] (manual + learned rule for the merchant).
 *
 * `initial` lets the colocated render test seed the state without a fetch.
 * Viewers see everything read-only (the select is disabled, upload hidden).
 */

import * as React from "react";
import { AlertTriangle, CheckCircle2, Loader2, Sparkles, Upload } from "lucide-react";
import { CATEGORIES, categoryLabel, type ExpenseCategory } from "@/lib/expenses/categories";
import { categoriseCostLabel } from "@/lib/expenses/cost";
import type { ExpenseSummary, MonthBucket } from "@/lib/expenses/summary";
import { ApiError, userErrorMessage } from "@/lib/ui/user-error";

// ─── Types (API shapes) ─────────────────────────────────────────────────────

export interface TransactionItem {
  id: string;
  occurredOn: string;
  description: string;
  amountAud: number;
  counterparty: string | null;
  category: ExpenseCategory;
  categorySource: "rule" | "ai" | "manual" | null;
  confidence: number;
  needsReview: boolean;
  gstTreatment: string;
}

export interface ExpensesListData {
  ok: boolean;
  role: string;
  transactions: TransactionItem[];
  total: number;
  queue: number;
  cost: number;
  listedCost: number;
  included: boolean;
  creditNote?: string;
}

export interface ExpensesState {
  list: ExpensesListData | null;
  summary: ExpenseSummary | null;
  disclaimer?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export function aud(n: number): string {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n);
}

function aud2(n: number): string {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return `${MONTHS[m - 1]} ${String(y).slice(2)}`;
}

function dayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1]} ${String(y).slice(2)}`;
}

/** Colour per category for the chart — expense keys only; income is drawn separately. */
export const CATEGORY_COLOURS: Record<string, string> = {
  cost_of_sales: "#0f766e",
  contractors: "#7c3aed",
  salaries_wages: "#1d4ed8",
  superannuation: "#60a5fa",
  rent: "#b45309",
  software_subscriptions: "#0891b2",
  cloud_hosting: "#0e7490",
  marketing_advertising: "#db2777",
  travel: "#ea580c",
  meals_entertainment: "#f59e0b",
  professional_fees: "#4b5563",
  insurance: "#6b7280",
  bank_fees: "#9ca3af",
  interest: "#a16207",
  equipment: "#059669",
  r_and_d: "#16a34a",
  other: "#d1d5db",
};

const SOURCE_LABEL: Record<string, string> = { rule: "rule", ai: "AI", manual: "you" };

// ─── Summary tiles ──────────────────────────────────────────────────────────

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "warn" | "ok" | "muted" }) {
  return (
    <div className="rounded-xl border border-surface-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-ink-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-ink-800 mt-1">{value}</p>
      {sub && <p className={`text-xs mt-1 ${tone === "warn" ? "text-amber-700" : tone === "ok" ? "text-green-700" : "text-ink-500"}`}>{sub}</p>}
    </div>
  );
}

export function SummaryTiles({ summary }: { summary: ExpenseSummary }) {
  const months = summary.monthsWithData;
  const window = months === 0 ? "no data yet" : months === 1 ? "1 month of data" : `${months} months of data`;
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3" data-testid="expenses-summary-tiles">
      <Tile label="Spend" value={aud(summary.totals.expenses)} sub={window} />
      <Tile label="Burn rate" value={`${aud(summary.burnRateAud)}/mo`} sub="avg monthly spend" />
      <Tile label="Income" value={aud(summary.totals.income)} sub="revenue + grants" />
      <Tile
        label="Net"
        value={aud(summary.totals.net)}
        sub={summary.netBurnAud > 0 ? `net burn ${aud(summary.netBurnAud)}/mo` : "cash-flow positive"}
        tone={summary.netBurnAud > 0 ? "warn" : "ok"}
      />
      <Tile
        label="GST position"
        value={`${summary.gst.netPosition >= 0 ? "" : "−"}${aud(Math.abs(summary.gst.netPosition))}`}
        sub={`estimate · ${summary.gst.netPosition >= 0 ? "likely payable" : "likely refundable"}`}
        tone="muted"
      />
      <Tile label="To review" value={String(summary.needsReviewCount)} sub={summary.needsReviewCount > 0 ? "pick a category below" : "all lines placed"} tone={summary.needsReviewCount > 0 ? "warn" : "ok"} />
    </div>
  );
}

// ─── Monthly stacked bar chart (SVG, no deps) ────────────────────────────────

/** Top-N expense categories across the window; the rest folds into "other". */
export function chartCategories(months: readonly MonthBucket[], topN = 6): ExpenseCategory[] {
  const totals = new Map<ExpenseCategory, number>();
  for (const m of months) {
    for (const [k, v] of Object.entries(m.byCategory)) {
      const key = k as ExpenseCategory;
      if (key === "revenue" || key === "government_grants") continue;
      totals.set(key, (totals.get(key) ?? 0) + Math.max(0, v ?? 0));
    }
  }
  const ranked = [...totals.entries()].filter(([k]) => k !== "other").sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const keys = ranked.slice(0, topN);
  const hasRest = ranked.length > topN || totals.has("other");
  return hasRest ? [...keys, "other"] : keys;
}

export function MonthlyCategoryChart({ months }: { months: readonly MonthBucket[] }) {
  if (months.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-surface-200 bg-surface-50 px-4 py-8 text-center text-xs text-ink-500" data-testid="expenses-chart-empty">
        Upload a statement to see spend by month and category.
      </div>
    );
  }
  const keys = chartCategories(months);
  const keySet = new Set<string>(keys);
  const stacks = months.map((m) => {
    const parts: Array<{ key: ExpenseCategory; value: number }> = [];
    let rest = 0;
    for (const [k, v] of Object.entries(m.byCategory)) {
      const key = k as ExpenseCategory;
      if (key === "revenue" || key === "government_grants") continue;
      const val = Math.max(0, v ?? 0);
      if (keySet.has(key) && key !== "other") parts.push({ key, value: val });
      else rest += val;
    }
    if (rest > 0 || keySet.has("other")) parts.push({ key: "other", value: rest });
    return { month: m.month, income: m.income, total: m.expenses, parts: keys.map((k) => parts.find((p) => p.key === k) ?? { key: k, value: 0 }) };
  });
  const max = Math.max(1, ...stacks.map((s) => Math.max(s.total, s.income)));
  const W = 720;
  const H = 240;
  const pad = { top: 12, right: 12, bottom: 28, left: 56 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const slot = innerW / stacks.length;
  const barW = Math.max(8, Math.min(48, slot * 0.55));
  const y = (v: number) => pad.top + innerH * (1 - v / max);

  return (
    <div data-testid="expenses-chart">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Monthly spend by category, with income as a marker">
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={pad.left} x2={W - pad.right} y1={y(max * f)} y2={y(max * f)} stroke="#e5e7eb" strokeWidth={1} />
            <text x={pad.left - 6} y={y(max * f) + 4} fontSize={10} textAnchor="end" fill="#6b7280">
              {aud(max * f)}
            </text>
          </g>
        ))}
        {stacks.map((s, i) => {
          const x = pad.left + slot * i + (slot - barW) / 2;
          let acc = 0;
          return (
            <g key={s.month}>
              {s.parts.map((p) => {
                if (p.value <= 0) return null;
                const y1 = y(acc + p.value);
                const h = y(acc) - y1;
                acc += p.value;
                return <rect key={p.key} x={x} y={y1} width={barW} height={h} fill={CATEGORY_COLOURS[p.key] ?? "#d1d5db"}>
                  <title>{`${monthLabel(s.month)} · ${categoryLabel(p.key)} · ${aud(p.value)}`}</title>
                </rect>;
              })}
              {s.income > 0 && (
                <line x1={x - 4} x2={x + barW + 4} y1={y(s.income)} y2={y(s.income)} stroke="#15803d" strokeWidth={2} strokeDasharray="4 2">
                  <title>{`${monthLabel(s.month)} · income ${aud(s.income)}`}</title>
                </line>
              )}
              <text x={x + barW / 2} y={H - 10} fontSize={10} textAnchor="middle" fill="#374151">
                {monthLabel(s.month)}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-600">
        {keys.map((k) => (
          <span key={k} className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: CATEGORY_COLOURS[k] ?? "#d1d5db" }} />
            {categoryLabel(k)}
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-0.5 w-3 border-t-2 border-dashed border-green-700" /> income
        </span>
      </div>
    </div>
  );
}

// ─── Categorise button (preview → confirm) ───────────────────────────────────

interface Preview {
  queue: number;
  cost: number;
  included: boolean;
  balance: number | null;
  creditNote?: string;
}

export function CategoriseButton({
  queue,
  cost,
  included,
  canWrite,
  onDone,
}: {
  queue: number;
  cost: number;
  included: boolean;
  canWrite: boolean;
  onDone: (msg: string) => void;
}) {
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [busy, setBusy] = React.useState<"preview" | "run" | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  async function openPreview() {
    setBusy("preview");
    setErr(null);
    try {
      const res = await fetch("/api/expenses/categorise", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const body = await res.json();
      if (!res.ok) {
        setErr(body.error === "insufficient_credits" ? `Not enough credits — this run costs ${body.creditsRequired}, you have ${body.balance}.` : userErrorMessage(ApiError.fromBody(res.status, body), "Could not price the run."));
        return;
      }
      setPreview({ queue: body.queue, cost: body.cost, included: body.included, balance: body.balance, creditNote: body.creditNote });
    } catch (err) {
      console.error("[expenses] preview", err);
      setErr(userErrorMessage(err, "Could not price the run. Please try again."));
    } finally {
      setBusy(null);
    }
  }

  async function confirm() {
    setBusy("run");
    setErr(null);
    try {
      const res = await fetch("/api/expenses/categorise", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: true }) });
      const body = await res.json();
      if (!res.ok) {
        setErr(userErrorMessage(ApiError.fromBody(res.status, body), "The run failed."));
        return;
      }
      setPreview(null);
      const failedRows = typeof body.failedRows === "number" ? body.failedRows : 0;
      const refunded = typeof body.refunded === "number" ? body.refunded : 0;
      onDone(`AI categorised ${body.accepted} of ${body.categorised} lines${body.needsReview ? ` — ${body.needsReview} still need your pick` : ""}${failedRows ? ` — ${failedRows} left in the queue (the model did not answer for them)` : ""}${body.creditsCharged ? ` · ${body.creditsCharged} credit${body.creditsCharged === 1 ? "" : "s"} charged` : " · no credits charged"}${refunded ? `, ${refunded} refunded` : ""}.`);
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(null);
    }
  }

  if (queue <= 0) return null;
  return (
    <div data-testid="categorise-button">
      <button
        type="button"
        onClick={openPreview}
        disabled={!canWrite || busy !== null || preview !== null}
        className="inline-flex items-center gap-1.5 rounded-lg bg-action px-3 py-1.5 text-xs font-semibold text-on-action hover:bg-action-hover disabled:opacity-60"
      >
        {busy === "preview" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        {categoriseCostLabel(queue, cost, included)}
      </button>
      {!canWrite && <p className="mt-1 text-[11px] text-ink-500">Viewers can see the queue; an editor runs it.</p>}
      {preview && (
        <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-ink-800" data-testid="categorise-preview">
          <p className="font-semibold">
            Run AI on {preview.queue} line{preview.queue === 1 ? "" : "s"} — {preview.included ? "included in your plan" : `${preview.cost} credit${preview.cost === 1 ? "" : "s"}`}
          </p>
          {!preview.included && (
            <p className="mt-1 text-ink-600">
              1 credit per 100 lines (min 1). {preview.balance !== null ? `Balance after: ${Math.max(0, preview.balance - preview.cost)}.` : ""} {preview.creditNote ?? ""}
            </p>
          )}
          <p className="mt-1 text-ink-600">Lines the model is unsure about come back as &ldquo;needs review&rdquo; at no extra cost. Rule-matched lines are never sent.</p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={confirm} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800 disabled:opacity-60">
              {busy === "run" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {preview.included ? "Run now" : `Confirm and spend ${preview.cost} credit${preview.cost === 1 ? "" : "s"}`}
            </button>
            <button type="button" onClick={() => setPreview(null)} disabled={busy !== null} className="rounded-lg border border-surface-200 px-3 py-1.5 text-xs font-medium text-ink-600 hover:bg-surface-50">
              Cancel
            </button>
          </div>
        </div>
      )}
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </div>
  );
}

// ─── Upload card ─────────────────────────────────────────────────────────────

interface ImportResult {
  bankName: string;
  parsed: number;
  skipped: number;
  inserted: number;
  duplicates: number;
  ruleCategorised: number;
  needsAi: number;
}

function UploadCard({ onImported }: { onImported: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/expenses/import", { method: "POST", body: fd });
      const body = await res.json();
      if (!res.ok) {
        setErr(userErrorMessage(ApiError.fromBody(res.status, body), "Import failed."));
        return;
      }
      setResult(body as ImportResult);
      onImported();
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <section className="rounded-2xl border border-surface-200 bg-white p-5" data-testid="expenses-upload">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink-800">Upload a bank statement</h2>
          <p className="text-xs text-ink-500 mt-0.5">CSV export from ANZ, CBA, NAB, Westpac or any bank with Date + Amount columns. Re-uploading the same lines is safe — duplicates are skipped.</p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-surface-200 px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-surface-50">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {busy ? "Importing…" : "Choose CSV"}
          <input ref={inputRef} type="file" accept=".csv,text/csv" className="sr-only" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
        </label>
      </div>
      {result && (
        <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-green-700" data-testid="import-result">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {result.bankName}: {result.inserted} new line{result.inserted === 1 ? "" : "s"} stored ({result.duplicates} duplicate{result.duplicates === 1 ? "" : "s"} skipped
          {result.skipped ? `, ${result.skipped} unreadable` : ""}) · rules placed {result.ruleCategorised} · {result.needsAi} left for AI
        </p>
      )}
      {err && <p className="mt-3 text-xs text-red-600">{err}</p>}
    </section>
  );
}

// ─── Review table ────────────────────────────────────────────────────────────

export function ReviewTable({
  rows,
  canWrite,
  onChange,
}: {
  rows: TransactionItem[];
  canWrite: boolean;
  onChange?: (id: string, category: ExpenseCategory) => Promise<void> | void;
}) {
  const [saving, setSaving] = React.useState<string | null>(null);
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-surface-200 bg-surface-50 px-4 py-8 text-center text-xs text-ink-500" data-testid="review-empty">
        No bank lines yet.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto" data-testid="review-table">
      <table className="w-full text-xs">
        <thead className="sticky top-0 z-10 bg-surface-sunken text-left text-xs font-semibold uppercase tracking-wide text-muted">
          <tr className="text-left text-[11px] uppercase tracking-wide text-ink-500">
            <th className="py-2 pr-3 font-medium">Date</th>
            <th className="py-2 pr-3 font-medium">Description</th>
            <th className="py-2 pr-3 font-medium text-right">Amount</th>
            <th className="py-2 pr-3 font-medium">Category</th>
            <th className="py-2 font-medium">Set by</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line-subtle">
          {rows.map((r) => (
            <tr key={r.id} className={`border-t border-surface-100 ${r.needsReview ? "bg-amber-50/60" : ""}`} data-testid={r.needsReview ? "review-row-needs" : "review-row"}>
              <td className="py-1.5 pr-3 whitespace-nowrap text-ink-600">{dayLabel(r.occurredOn)}</td>
              <td className="py-1.5 pr-3 text-ink-800">
                <span className="line-clamp-1" title={r.description}>{r.description}</span>
              </td>
              <td className={`py-1.5 pr-3 text-right whitespace-nowrap font-medium ${r.amountAud < 0 ? "text-ink-800" : "text-green-700"}`}>{aud2(r.amountAud)}</td>
              <td className="py-1.5 pr-3">
                <select
                  aria-label={`Category for ${r.description}`}
                  value={r.category}
                  disabled={!canWrite || saving === r.id}
                  onChange={async (e) => {
                    const next = e.target.value as ExpenseCategory;
                    setSaving(r.id);
                    try {
                      await onChange?.(r.id, next);
                    } finally {
                      setSaving(null);
                    }
                  }}
                  className={`w-full max-w-[220px] rounded-md border px-2 py-1 text-xs ${r.needsReview ? "border-amber-300 bg-white" : "border-surface-200 bg-white"}`}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.key} value={c.key} title={c.description}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </td>
              <td className="py-1.5 whitespace-nowrap text-ink-500">
                {r.needsReview ? (
                  <span className="inline-flex items-center gap-1 text-amber-700"><AlertTriangle className="h-3 w-3" /> needs review</span>
                ) : (
                  <span>{SOURCE_LABEL[r.categorySource ?? ""] ?? "—"}{r.categorySource && r.categorySource !== "manual" ? ` · ${Math.round(r.confidence * 100)}%` : ""}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main client ─────────────────────────────────────────────────────────────

async function fetchExpenses(): Promise<ExpensesState | { error: string }> {
  const [l, s] = await Promise.all([fetch("/api/expenses"), fetch("/api/expenses/summary")]);
  const lb = await l.json();
  const sb = await s.json();
  if (!l.ok) {
    return { error: lb.error === "project_required" ? "Select a startup first — bank lines are stored per project." : lb.error ?? "Could not load expenses." };
  }
  return { list: lb, summary: s.ok ? sb.summary : null, disclaimer: s.ok ? sb.disclaimer : undefined };
}

export function ExpensesClient({ initial }: { initial?: ExpensesState }) {
  const [state, setState] = React.useState<ExpensesState | null>(initial ?? null);
  const [loading, setLoading] = React.useState(!initial);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  // One fetcher for the initial effect and every reload; setState only runs
  // in the promise callbacks (react-hooks/set-state-in-effect).
  const load = React.useCallback((isAlive: () => boolean = () => true) => {
    return fetchExpenses()
      .then((r) => {
        if (!isAlive()) return;
        if ("error" in r) setError(r.error);
        else {
          setError(null);
          setState(r);
        }
      })
      .catch(() => { if (isAlive()) setError("Network error."); })
      .finally(() => { if (isAlive()) setLoading(false); });
  }, []);

  React.useEffect(() => {
    if (initial) return;
    let alive = true;
    void load(() => alive);
    return () => {
      alive = false;
    };
  }, [initial, load]);

  async function recategorise(id: string, category: ExpenseCategory) {
    const res = await fetch(`/api/expenses/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ category }) });
    const body = await res.json();
    if (!res.ok) {
      setNotice(userErrorMessage(ApiError.fromBody(res.status, body), "Could not save the category."));
      return;
    }
    setNotice(body.siblingsUpdated > 0 ? `Saved — and applied to ${body.siblingsUpdated} other line${body.siblingsUpdated === 1 ? "" : "s"} from the same merchant.` : "Saved. Future imports of this merchant will use it.");
    await load();
  }

  if (loading && !state) return <div className="animate-pulse h-40 bg-surface-100 rounded-2xl" data-testid="expenses-loading" />;
  if (error && !state) {
    return (
      <div className="rounded-2xl border border-surface-200 bg-surface-50 p-4 text-xs text-ink-500" data-testid="expenses-error">
        {error}
      </div>
    );
  }
  const list = state?.list ?? null;
  const summary = state?.summary ?? null;
  const canWrite = Boolean(list && list.role !== "viewer");

  return (
    <div className="space-y-6" data-testid="expenses-client">
      {canWrite && <UploadCard onImported={() => void load()} />}

      {summary && <SummaryTiles summary={summary} />}

      <section className="rounded-2xl border border-surface-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-ink-800">Monthly spend by category</h2>
            <p className="text-xs text-ink-500 mt-0.5">Transfers between your own accounts and founder money are left out of the P&amp;L.</p>
          </div>
          {list && <CategoriseButton queue={list.queue} cost={list.cost} included={list.included} canWrite={canWrite} onDone={(m) => { setNotice(m); void load(); }} />}
        </div>
        <div className="mt-4">
          <MonthlyCategoryChart months={summary?.months ?? []} />
        </div>
      </section>

      {summary && summary.topMerchants.length > 0 && (
        <section className="rounded-2xl border border-surface-200 bg-white p-5" data-testid="top-merchants">
          <h2 className="text-sm font-semibold text-ink-800">Top merchants</h2>
          <ul className="mt-2 divide-y divide-surface-100 text-xs">
            {summary.topMerchants.map((m) => (
              <li key={m.counterparty} className="flex items-center justify-between py-1.5">
                <span className="text-ink-800 capitalize">{m.counterparty} <span className="text-ink-400">· {m.label} · {m.count}×</span></span>
                <span className="font-medium text-ink-800">{aud(m.total)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {notice && (
        <p className="text-xs text-ink-700 rounded-lg border border-surface-200 bg-surface-50 px-3 py-2" data-testid="expenses-notice">
          {notice}
        </p>
      )}

      <section className="rounded-2xl border border-surface-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink-800">Bank lines {list ? `(${list.total})` : ""}</h2>
          <p className="text-[11px] text-ink-500">Lines needing review come first. Changing a category teaches the next import.</p>
        </div>
        <div className="mt-3">
          <ReviewTable rows={list?.transactions ?? []} canWrite={canWrite} onChange={recategorise} />
        </div>
      </section>

      {summary && (
        <section className="rounded-2xl border border-surface-200 bg-surface-50 p-4 text-xs text-ink-600" data-testid="gst-estimate">
          <p className="font-semibold text-ink-800">GST estimate</p>
          <p className="mt-1">
            GST on sales ≈ {aud2(summary.gst.gstOnSales)} · GST credits on purchases ≈ {aud2(summary.gst.gstCreditsOnPurchases)} (on {aud(summary.gst.gstTreatedPurchases)} of GST-treated spend) · net ≈ {aud2(summary.gst.netPosition)}.
          </p>
          <p className="mt-1 text-ink-500">{summary.gst.note}</p>
          {state?.disclaimer && <p className="mt-1 text-ink-500">{state.disclaimer}</p>}
        </section>
      )}
    </div>
  );
}
