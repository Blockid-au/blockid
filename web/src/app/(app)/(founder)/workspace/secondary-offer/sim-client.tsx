"use client";

// Workspace › Secondary Offer › SANDBOX order book (S27-B, client).
//
// A clearly-labelled simulation over the project's tokenised shares:
// order form, depth ladder, trades tape, sandbox positions and the
// "sandbox implied" price discovery from /api/secondary/sim/book. Nothing
// here offers, issues or transfers a security — the banner is rendered on
// every state (loading, error, empty, live) and the API repeats it.
//
// `canTrade` = the caller is editor+ AND the plan carries
// secondary_market.view (server-resolved on the page). Viewers and locked
// plans see the book read-only with the upgrade / role note.

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowDownUp, Loader2, ShieldCheck, XCircle } from "lucide-react";

interface DepthLevel { price: number; qty: number; orders: number; held: number }
interface Trade { id: string; buyerLabel: string; sellerLabel: string; price: number; qty: number; tradedAt: string }
interface Holder { holderKey: string; label: string; register: number; position: number; restingSell: number; onRegister: boolean }
export interface BookState {
  sandbox: true;
  notice: string;
  role?: string;
  settings: { rofrEnabled: boolean; rofrHoldHours: number };
  depth: { bids: DepthLevel[]; asks: DepthLevel[]; bestBid: number | null; bestAsk: number | null; spread: number | null };
  discovery: { label: string; last: number | null; mid: number | null; vwap: number | null; impliedValuationAud: number | null; fullyDilutedShares: number; tradedShares: number; tradeCount: number };
  trades: Trade[];
  holders: Holder[];
  fullyDilutedShares: number;
}
interface OpenOrder { id: string; holderKey: string; holderLabel: string; side: "buy" | "sell"; price: number; qty: number; remaining: number; status: string; holdUntil: string | null; createdAt: string }

const BANNER =
  "Sandbox — no real securities are offered or transferred; not an offer under Chapter 6D or Chapter 7 of the Corporations Act 2001 (Cth).";

const aud = (n: number | null, dp = 4) => (n === null || !Number.isFinite(n) ? "—" : `A$${n.toLocaleString("en-AU", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`);
const big = (n: number | null) => (n === null || !Number.isFinite(n) ? "—" : n >= 1_000_000 ? `A$${(n / 1_000_000).toFixed(2)}M` : n >= 1_000 ? `A$${(n / 1_000).toFixed(0)}K` : `A$${Math.round(n).toLocaleString("en-AU")}`);
const num = (n: number) => (Number.isFinite(n) ? n.toLocaleString("en-AU") : "0");

export function SandboxBanner() {
  return (
    <div
      role="note"
      className="rounded-xl border-2 border-dashed border-amber-400 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-900 dark:border-amber-600 dark:bg-amber-950/30 dark:text-amber-100 flex items-start gap-2"
      data-testid="sandbox-banner"
    >
      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
      <span>{BANNER}</span>
    </div>
  );
}

export function SecondarySimClient({ canTrade, locked, initial }: { canTrade: boolean; locked: boolean; initial?: BookState | null }) {
  const [book, setBook] = React.useState<BookState | null>(initial ?? null);
  const [orders, setOrders] = React.useState<OpenOrder[]>([]);
  const [loading, setLoading] = React.useState(!initial);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<{ kind: "ok" | "warn" | "err"; text: string } | null>(null);

  const [side, setSide] = React.useState<"buy" | "sell">("buy");
  const [holder, setHolder] = React.useState<string>("");
  const [buyerLabel, setBuyerLabel] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [qty, setQty] = React.useState("");

  const load = React.useCallback(async () => {
    try {
      const [b, o] = await Promise.all([fetch("/api/secondary/sim/book"), fetch("/api/secondary/sim/orders")]);
      const bj = await b.json();
      const oj = await o.json();
      if (bj?.ok) setBook(bj as BookState);
      else setError(bj?.error === "project_required" ? "Select a project to open its sandbox." : bj?.error ?? "Could not load the sandbox");
      if (oj?.ok) setOrders((oj.orders as OpenOrder[]).filter((x) => x.status === "open" || x.status === "held"));
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (initial) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-only async fetch; the loader is a useCallback reused after every order action
    load();
  }, [initial, load]);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/secondary/sim/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json();
      if (!res.ok || !d?.ok) {
        if (res.status === 402) setNotice({ kind: "warn", text: "The sandbox order book is part of Growth and above." });
        else setNotice({ kind: "err", text: d?.detail ?? d?.error ?? "Order refused" });
        return null;
      }
      return d;
    } catch {
      setNotice({ kind: "err", text: "Network error" });
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function place(e: React.FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = { action: "place", side, price: Number(price), qty: Number(qty) };
    if (holder === "__sandbox__") body.holderLabel = buyerLabel.trim();
    else body.shareholderId = holder.replace(/^sh:/, "");
    const d = await post(body);
    if (!d) return;
    const fills = Array.isArray(d.fills) ? d.fills.length : 0;
    const filled = (d.fills as Array<{ qty: number }> | undefined)?.reduce((s, f) => s + f.qty, 0) ?? 0;
    setNotice({
      kind: "ok",
      text: d.held
        ? `Sell order held for the ROFR window (${book?.settings.rofrHoldHours ?? 48} h) — it will join the book when the hold lapses (sandbox).`
        : fills > 0
          ? `Filled ${num(filled)} of ${num(Number(qty))} shares across ${fills} sandbox trade${fills === 1 ? "" : "s"}${d.order?.remaining > 0 ? `; ${num(d.order.remaining)} resting.` : "."}`
          : "Order resting on the sandbox book.",
    });
    setQty("");
    await load();
  }

  async function cancel(id: string) {
    const d = await post({ action: "cancel", orderId: id });
    if (d) {
      setNotice({ kind: "ok", text: "Order cancelled." });
      await load();
    }
  }

  async function toggleRofr(next: boolean) {
    const d = await post({ action: "settings", rofrEnabled: next });
    if (d) await load();
  }

  const holders = book?.holders ?? [];
  const selected = holders.find((h) => h.holderKey === holder);
  const sellCap = selected ? Math.max(0, selected.position - selected.restingSell) : 0;

  return (
    <section className="space-y-4" data-testid="secondary-sim" aria-label="Sandbox order book">
      <SandboxBanner />

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ArrowDownUp strokeWidth={1.75} className="h-5 w-5 text-ink-500" />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Pre-IPO secondary sandbox</h2>
          <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
            Sandbox
          </span>
        </div>
        {book ? (
          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
            <input type="checkbox" checked={book.settings.rofrEnabled} disabled={!canTrade || busy} onChange={(e) => toggleRofr(e.target.checked)} data-testid="sim-rofr-toggle" />
            Enforce shareholders&apos; agreement ROFR ({book.settings.rofrHoldHours} h hold on new sells)
          </label>
        ) : null}
      </header>

      {locked ? (
        <div className="rounded-xl border border-brand-200 bg-brand-50/60 px-4 py-3 text-sm text-brand-900 dark:border-brand-800 dark:bg-brand-950/30 dark:text-brand-100" data-testid="sim-locked">
          The sandbox order book is part of <strong>Growth</strong> and above — the same rung that carries your cap table.{" "}
          <Link href="/pricing?feature=secondary_market.view&from=/workspace/secondary-offer" className="underline font-medium">See plans</Link>
        </div>
      ) : null}

      {loading ? <div className="animate-pulse h-40 rounded-2xl bg-slate-100 dark:bg-slate-800" data-testid="sim-loading" /> : null}
      {error ? <p className="text-sm text-red-700" data-testid="sim-error">{error}</p> : null}

      {book ? (
        <>
          {/* price discovery */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs" data-testid="sim-discovery">
            <Stat label="Last (sandbox)" value={aud(book.discovery.last)} />
            <Stat label="Mid" value={aud(book.discovery.mid)} />
            <Stat label="VWAP" value={aud(book.discovery.vwap)} />
            <Stat label="Spread" value={aud(book.depth.spread)} />
            <Stat label="Sandbox implied valuation" value={big(book.discovery.impliedValuationAud)} sub={`last × ${num(book.fullyDilutedShares)} fully diluted — not a valuation`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {/* order form */}
            <form onSubmit={place} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-4 space-y-3" data-testid="sim-order-form">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Place a sandbox order</p>
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1 text-xs font-medium">
                {(["buy", "sell"] as const).map((s) => (
                  <button key={s} type="button" onClick={() => setSide(s)} className={`rounded-md py-1.5 ${side === s ? (s === "buy" ? "bg-emerald-600 text-white" : "bg-red-600 text-white") : "text-slate-600 dark:text-slate-300"}`} data-testid={`sim-side-${s}`}>
                    {s === "buy" ? "Buy" : "Sell"}
                  </button>
                ))}
              </div>
              <label className="block text-xs text-slate-600 dark:text-slate-400">
                Trade as
                <select value={holder} onChange={(e) => setHolder(e.target.value)} required className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-2 py-1.5 text-sm" data-testid="sim-holder">
                  <option value="">Select a holder…</option>
                  {holders.filter((h) => h.onRegister).map((h) => (
                    <option key={h.holderKey} value={h.holderKey}>{h.label} — holds {num(h.position)}</option>
                  ))}
                  {holders.filter((h) => !h.onRegister).map((h) => (
                    <option key={h.holderKey} value={h.holderKey}>{h.label} (sandbox buyer) — holds {num(h.position)}</option>
                  ))}
                  {side === "buy" ? <option value="__sandbox__">New sandbox buyer…</option> : null}
                </select>
              </label>
              {holder === "__sandbox__" ? (
                <label className="block text-xs text-slate-600 dark:text-slate-400">
                  Buyer label
                  <input value={buyerLabel} onChange={(e) => setBuyerLabel(e.target.value)} required maxLength={120} placeholder="e.g. Angel syndicate A" className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-2 py-1.5 text-sm" data-testid="sim-buyer-label" />
                </label>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs text-slate-600 dark:text-slate-400">
                  Limit price (A$)
                  <input value={price} onChange={(e) => setPrice(e.target.value)} required type="number" min="0.0001" step="0.0001" className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-2 py-1.5 text-sm font-mono" data-testid="sim-price" />
                </label>
                <label className="block text-xs text-slate-600 dark:text-slate-400">
                  Shares
                  <input value={qty} onChange={(e) => setQty(e.target.value)} required type="number" min="1" step="1" max={side === "sell" && selected ? sellCap : undefined} className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-2 py-1.5 text-sm font-mono" data-testid="sim-qty" />
                </label>
              </div>
              {side === "sell" && selected ? (
                <p className="text-[11px] text-slate-500">Can sell up to {num(sellCap)} (position {num(selected.position)}, {num(selected.restingSell)} resting). No shorting.</p>
              ) : null}
              <button type="submit" disabled={!canTrade || busy || !holder} className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 inline-flex items-center justify-center gap-2" data-testid="sim-submit">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Place sandbox {side}
              </button>
              {!canTrade && !locked ? <p className="text-[11px] text-slate-500">Editors and above can place sandbox orders.</p> : null}
              {notice ? (
                <p role="status" className={`text-xs ${notice.kind === "ok" ? "text-emerald-700" : notice.kind === "warn" ? "text-amber-700" : "text-red-700"}`} data-testid="sim-notice">{notice.text}</p>
              ) : null}
            </form>

            {/* depth ladder */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-4" data-testid="sim-depth">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Depth (sandbox)</p>
              <div className="mt-2 grid grid-cols-2 gap-3 text-xs font-mono">
                <div>
                  <p className="text-emerald-700 font-semibold">Bids</p>
                  {book.depth.bids.length === 0 ? <p className="text-slate-400">—</p> : book.depth.bids.map((l) => (
                    <div key={`b${l.price}`} className="flex justify-between"><span>{aud(l.price)}</span><span>{num(l.qty)}</span></div>
                  ))}
                </div>
                <div>
                  <p className="text-red-700 font-semibold">Asks</p>
                  {book.depth.asks.length === 0 ? <p className="text-slate-400">—</p> : book.depth.asks.map((l) => (
                    <div key={`a${l.price}`} className="flex justify-between"><span>{aud(l.price)}</span><span>{num(l.qty)}{l.held > 0 ? <span className="text-amber-600" title="inside ROFR hold"> ({num(l.held)} held)</span> : null}</span></div>
                  ))}
                </div>
              </div>
              {orders.length > 0 ? (
                <div className="mt-4 border-t border-slate-100 dark:border-slate-800 pt-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Open orders</p>
                  <ul className="mt-1 space-y-1 text-xs">
                    {orders.map((o) => (
                      <li key={o.id} className="flex items-center justify-between gap-2">
                        <span className="truncate">
                          <span className={o.side === "buy" ? "text-emerald-700" : "text-red-700"}>{o.side.toUpperCase()}</span> {num(o.remaining)} @ {aud(o.price)} · {o.holderLabel}
                          {o.status === "held" ? <span className="ml-1 text-amber-600">held</span> : null}
                        </span>
                        {canTrade ? (
                          <button type="button" onClick={() => cancel(o.id)} disabled={busy} className="text-slate-400 hover:text-red-600" aria-label={`Cancel order ${o.id}`} data-testid={`sim-cancel-${o.id}`}>
                            <XCircle className="h-4 w-4" />
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            {/* tape + positions */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-4" data-testid="sim-tape">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Trades tape (sandbox)</p>
              {book.trades.length === 0 ? <p className="mt-2 text-xs text-slate-400">No sandbox trades yet.</p> : (
                <ul className="mt-2 space-y-1 text-xs font-mono max-h-48 overflow-y-auto">
                  {book.trades.slice(0, 30).map((t) => (
                    <li key={t.id} className="flex justify-between gap-2">
                      <span className="truncate">{t.buyerLabel} ← {t.sellerLabel}</span>
                      <span>{num(t.qty)} @ {aud(t.price)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Sandbox positions</p>
              <ul className="mt-1 space-y-1 text-xs">
                {holders.map((h) => (
                  <li key={h.holderKey} className="flex justify-between gap-2">
                    <span className="truncate">{h.label}{h.onRegister ? "" : <span className="text-slate-400"> (sandbox)</span>}</span>
                    <span className="font-mono">{num(h.position)}{h.register !== h.position ? <span className="text-slate-400"> (reg {num(h.register)})</span> : null}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className="flex items-start gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>{book.notice} Sandbox positions never change the register or the chain.</span>
          </p>
        </>
      ) : null}
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-0.5 font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">{value}</p>
      {sub ? <p className="text-[10px] text-slate-500">{sub}</p> : null}
    </div>
  );
}
