"use client";

/**
 * "On-chain vs register" panel (S27-B) — shown on the cap-table page for a
 * project that has a share token on the BlockID private chain. Reads the
 * last reconciliation from GET /api/cap-table/chain-reconcile, lets an
 * editor+ run a fresh read-back ("Check chain now") and queue the register
 * → chain corrections on the existing sync queue ("Push register to chain").
 *
 * Off-chain first: the register is the source of truth; the chain is the
 * optional transparency layer. Drift rows show offchain / onchain / delta
 * (positive = chain is short). Unknown on-chain wallets are listed but
 * never touched by the push — that needs a human decision.
 *
 * `initial` seeds the state without a fetch (tests / server pages).
 */

import * as React from "react";
import { Link2, RefreshCw, UploadCloud, AlertTriangle, CheckCircle2, WifiOff } from "lucide-react";

export interface ReconcileSummary {
  matched?: Array<{ shareholder: string; address: string; shares: number }>;
  driftRows?: Array<{ shareholder: string; address: string; offchain: number; onchain: number; delta: number }>;
  unknownOnChain?: Array<{ address: string; shares: number }>;
  missingOnChain?: Array<{ shareholder: string; address: string | null; shares: number; reason: "zero_balance" | "no_wallet" }>;
  totals?: { offchainShares: number; onchainShares: number; delta: number; registerRows: number; onchainHolders: number; driftCount: number };
  error?: string;
}

export interface ReconcileState {
  token: { address: string; symbol: string | null; syncEnabled: boolean } | null;
  last: {
    id: string;
    taken_at: string;
    status: "in_sync" | "drift" | "unreachable";
    drift_count: number;
    summary: ReconcileSummary;
    source: "route" | "cron";
  } | null;
  role?: string;
}

const fmt = (n: number) => (Number.isFinite(n) ? n.toLocaleString("en-AU") : "0");
const short = (a: string | null) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");

const STATUS: Record<"in_sync" | "drift" | "unreachable", { label: string; className: string; Icon: typeof Link2 }> = {
  in_sync: { label: "In sync", className: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: CheckCircle2 },
  drift: { label: "Drift", className: "bg-amber-50 text-amber-800 border-amber-200", Icon: AlertTriangle },
  unreachable: { label: "Chain unreachable", className: "bg-surface-100 text-ink-600 border-surface-200", Icon: WifiOff },
};

export function ChainReconcilePanel({ initial }: { initial?: ReconcileState | null }) {
  const [state, setState] = React.useState<ReconcileState | null>(initial ?? null);
  const [loading, setLoading] = React.useState(!initial);
  const [busy, setBusy] = React.useState<"run" | "push" | null>(null);
  const [notice, setNotice] = React.useState<{ kind: "ok" | "warn" | "err"; text: string } | null>(null);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/cap-table/chain-reconcile");
      const d = await res.json();
      if (d?.ok) setState({ token: d.token ?? null, last: d.last ?? null, role: d.role });
      else setState(null);
    } catch {
      setState(null);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (initial) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-only async fetch; the loader is a useCallback reused after run / push, the rule cannot see the async boundary through the reference
    load();
  }, [initial, load]);

  async function act(action: "run" | "push") {
    setBusy(action);
    setNotice(null);
    try {
      const res = await fetch("/api/cap-table/chain-reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const d = await res.json();
      if (!res.ok || !d?.ok) {
        setNotice({ kind: "err", text: d?.message ?? d?.error ?? "Could not reach the chain" });
      } else if (action === "push") {
        const q = Number(d.push?.queued ?? 0);
        const s = Number(d.push?.skipped ?? 0);
        setNotice({
          kind: q > 0 ? "ok" : "warn",
          text: q > 0
            ? `${q} correction${q === 1 ? "" : "s"} queued on the sync queue.${d.push?.executes === false ? " On-chain execution is not enabled yet (no server signing key) — balances on chain will not change until it is; the queue keeps the corrections." : " The sync runner applies them within 15 minutes."}${s ? ` ${s} row${s === 1 ? "" : "s"} skipped (no wallet or unknown on chain).` : ""}`
            : "Nothing to push — every wallet-backed holder already matches, or the remaining rows need a wallet first.",
        });
      } else if (d.status === "unreachable") {
        setNotice({ kind: "warn", text: `The chain could not be read (${d.error ?? "RPC error"}). The run was recorded; try again later.` });
      } else {
        setNotice({ kind: d.status === "in_sync" ? "ok" : "warn", text: d.status === "in_sync" ? "Register and chain agree." : `${d.driftCount} row${d.driftCount === 1 ? "" : "s"} differ from the chain.` });
      }
      await load();
    } catch {
      setNotice({ kind: "err", text: "Network error" });
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <div className="animate-pulse h-24 rounded-2xl bg-surface-100" data-testid="chain-reconcile-loading" />;
  if (!state || !state.token) return null;

  const canWrite = state.role !== "viewer";
  const last = state.last;
  const sum = last?.summary ?? {};
  const totals = sum.totals;
  const status = last ? STATUS[last.status] : null;
  const drift = sum.driftRows ?? [];
  const missing = sum.missingOnChain ?? [];
  const unknown = sum.unknownOnChain ?? [];
  const pushable = drift.length + missing.filter((m) => m.reason === "zero_balance").length;

  return (
    <section id="on-chain" className="rounded-2xl border border-surface-200 bg-white" data-testid="chain-reconcile-panel" data-status={last?.status ?? "never"}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-surface-200">
        <div className="flex items-center gap-2">
          <Link2 strokeWidth={1.75} className="h-5 w-5 text-ink-500" />
          <h2 className="text-lg font-semibold text-ink-800">On-chain vs register</h2>
          {status ? (
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${status.className}`} data-testid="chain-reconcile-status">
              <status.Icon className="h-3 w-3" /> {status.label}
            </span>
          ) : (
            <span className="text-xs text-ink-500 bg-surface-100 rounded-full px-2 py-0.5">Never checked</span>
          )}
        </div>
        {canWrite ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => act("run")}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-surface-300 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-surface-50 disabled:opacity-50"
              data-testid="chain-reconcile-run"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${busy === "run" ? "animate-spin" : ""}`} /> Check chain now
            </button>
            <button
              type="button"
              onClick={() => act("push")}
              disabled={busy !== null || last?.status !== "drift" || pushable === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              data-testid="chain-reconcile-push"
              title={pushable === 0 ? "Nothing to push" : `Queue ${pushable} correction${pushable === 1 ? "" : "s"} on the sync queue (on-chain execution needs a server signing key — not enabled yet)`}
            >
              <UploadCloud className="h-3.5 w-3.5" /> Push register to chain
            </button>
          </div>
        ) : null}
      </div>

      <div className="px-5 py-4 space-y-4">
        <p className="text-xs text-ink-600">
          Token <span className="font-mono">{state.token.symbol ?? "SVT"}</span> at{" "}
          <span className="font-mono">{short(state.token.address)}</span>. The register is the source of truth; the chain is the
          transparency layer. Read back weekly (Sunday) and on demand.
          {last ? <> Last checked {new Date(last.taken_at).toLocaleString("en-AU")} ({last.source === "cron" ? "weekly sweep" : "manual"}).</> : null}
        </p>

        {notice ? (
          <div
            role="status"
            className={`rounded-lg border px-3 py-2 text-xs ${notice.kind === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : notice.kind === "warn" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-red-200 bg-red-50 text-red-800"}`}
            data-testid="chain-reconcile-notice"
          >
            {notice.text}
          </div>
        ) : null}

        {last?.status === "unreachable" ? (
          <p className="text-xs text-ink-600" data-testid="chain-reconcile-unreachable">
            The RPC host could not be read{sum.error ? ` (${sum.error})` : ""}. No drift is implied — this is an infrastructure state, not a register problem.
          </p>
        ) : null}

        {totals ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <Stat label="Register shares" value={fmt(totals.offchainShares)} />
            <Stat label="On-chain shares" value={fmt(totals.onchainShares)} />
            <Stat label="Delta (register − chain)" value={(totals.delta > 0 ? "+" : "") + fmt(totals.delta)} tone={totals.delta === 0 ? "ok" : "warn"} />
            <Stat label="Rows differing" value={fmt(totals.driftCount)} tone={totals.driftCount === 0 ? "ok" : "warn"} />
          </div>
        ) : null}

        {drift.length + missing.length + unknown.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs" data-testid="chain-drift-table">
              <thead>
                <tr className="text-left uppercase tracking-wider text-ink-500 border-b border-surface-200">
                  <th className="py-2 pr-4">Holder</th>
                  <th className="py-2 pr-4">Wallet</th>
                  <th className="py-2 pr-4 text-right">Register</th>
                  <th className="py-2 pr-4 text-right">On chain</th>
                  <th className="py-2 pr-4 text-right">Delta</th>
                  <th className="py-2 pr-4">Note</th>
                </tr>
              </thead>
              <tbody>
                {drift.map((d) => (
                  <tr key={`d-${d.address}`} className="border-b border-surface-100 last:border-0">
                    <td className="py-2 pr-4 font-medium text-ink-800">{d.shareholder}</td>
                    <td className="py-2 pr-4 font-mono text-ink-600">{short(d.address)}</td>
                    <td className="py-2 pr-4 text-right font-mono">{fmt(d.offchain)}</td>
                    <td className="py-2 pr-4 text-right font-mono">{fmt(d.onchain)}</td>
                    <td className={`py-2 pr-4 text-right font-mono ${d.delta > 0 ? "text-amber-700" : "text-red-700"}`}>{(d.delta > 0 ? "+" : "") + fmt(d.delta)}</td>
                    <td className="py-2 pr-4 text-ink-600">{d.delta > 0 ? "Chain is short — push mints the difference" : "Chain holds more — push burns the excess"}</td>
                  </tr>
                ))}
                {missing.map((m, i) => (
                  <tr key={`m-${m.address ?? i}`} className="border-b border-surface-100 last:border-0">
                    <td className="py-2 pr-4 font-medium text-ink-800">{m.shareholder}</td>
                    <td className="py-2 pr-4 font-mono text-ink-600">{short(m.address)}</td>
                    <td className="py-2 pr-4 text-right font-mono">{fmt(m.shares)}</td>
                    <td className="py-2 pr-4 text-right font-mono">0</td>
                    <td className="py-2 pr-4 text-right font-mono text-amber-700">+{fmt(m.shares)}</td>
                    <td className="py-2 pr-4 text-ink-600">{m.reason === "no_wallet" ? "No wallet on the register — add one before pushing" : "Wallet holds nothing yet — push mints the full holding"}</td>
                  </tr>
                ))}
                {unknown.map((u) => (
                  <tr key={`u-${u.address}`} className="border-b border-surface-100 last:border-0">
                    <td className="py-2 pr-4 font-medium text-ink-800">Unknown wallet</td>
                    <td className="py-2 pr-4 font-mono text-ink-600">{short(u.address)}</td>
                    <td className="py-2 pr-4 text-right font-mono">0</td>
                    <td className="py-2 pr-4 text-right font-mono">{fmt(u.shares)}</td>
                    <td className="py-2 pr-4 text-right font-mono text-red-700">−{fmt(u.shares)}</td>
                    <td className="py-2 pr-4 text-ink-600">Not on the register — never pushed; add the holder or transfer the tokens back</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : last?.status === "in_sync" ? (
          <p className="text-xs text-emerald-700" data-testid="chain-reconcile-insync">
            Every wallet-backed holder matches the chain ({fmt(sum.matched?.length ?? 0)} holder{(sum.matched?.length ?? 0) === 1 ? "" : "s"}).
          </p>
        ) : null}
      </div>
    </section>
  );
}

function Stat({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "ok" | "warn" | "neutral" }) {
  return (
    <div className="rounded-xl border border-surface-200 bg-surface-50 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-ink-500">{label}</p>
      <p className={`mt-0.5 font-mono text-sm font-semibold ${tone === "ok" ? "text-emerald-700" : tone === "warn" ? "text-amber-700" : "text-ink-800"}`}>{value}</p>
    </div>
  );
}
