// "What BlockID holds about this startup" — server-rendered panel (G21 P1-C).
// Reads the pure `DataEthicsPanel`; every action links to the EXISTING UI
// (revoke on /workspace/investors/access, connectors on /workspace/evidence/
// connectors) — nothing is rebuilt here.

import Link from "next/link";
import { Database, Eye, RefreshCcw, Share2, ShieldCheck } from "lucide-react";
import type { DataEthicsPanel } from "@/lib/corrections/data-ethics";

const LEVEL_LABEL: Record<string, string> = {
  self_declared: "self-declared",
  public_url: "public URL",
  document_uploaded: "document uploaded",
  connected_source: "connected source",
  transaction_data: "transaction data",
  third_party_verified: "third-party verified",
  unknown: "unlabelled",
};

function fmt(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString("en-AU", { year: "numeric", month: "short", day: "numeric" }) : iso;
}

const STATUS_CLASS: Record<string, string> = {
  fresh: "bg-emerald-100 text-emerald-800",
  stale: "bg-amber-100 text-amber-800",
  never: "bg-ink-100 text-ink-600",
  error: "bg-rose-100 text-rose-800",
};

export function DataEthicsPanelView({ panel }: { panel: DataEthicsPanel }) {
  const levels = Object.entries(panel.evidence.byLevel).sort((a, b) => b[1] - a[1]);
  return (
    <section aria-labelledby="data-ethics-heading" className="rounded-2xl border border-ink-200 bg-white p-5 space-y-5" data-testid="data-ethics-panel">
      <div>
        <h2 id="data-ethics-heading" className="text-base font-semibold text-ink-900 flex items-center gap-2">
          <Database className="h-4 w-4 text-brand-600" aria-hidden="true" />
          What BlockID holds about this startup
        </h2>
        <p className="text-xs text-ink-600 mt-1">
          Your startup owns its data. BlockID stores it only to process your requests and give the analysis the best context for your case. Score logic:{" "}
          <Link href={panel.links.scoreLogic} className="text-brand-700 underline decoration-dotted underline-offset-4">
            score governance
          </Link>
          .
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {/* Evidence */}
        <div className="space-y-2" data-testid="data-ethics-evidence">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500 flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Evidence on file
          </h3>
          <p className="text-sm text-ink-800">
            <span className="font-semibold tabular-nums" data-evidence-total>{panel.evidence.total}</span> items ·{" "}
            <span className="tabular-nums">{panel.evidence.verified}</span> verified ·{" "}
            <span className="tabular-nums">{panel.evidence.pendingReview}</span> awaiting review
          </p>
          {levels.length > 0 ? (
            <ul className="text-xs text-ink-600 space-y-0.5">
              {levels.map(([lvl, n]) => (
                <li key={lvl} className="flex justify-between gap-3">
                  <span>{LEVEL_LABEL[lvl] ?? lvl}</span>
                  <span className="tabular-nums">{n}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-ink-500">No evidence rows yet — <Link href="/workspace/evidence/gaps" className="underline">add the first item</Link>.</p>
          )}
        </div>

        {/* Who has access */}
        <div className="space-y-2" data-testid="data-ethics-access">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500 flex items-center gap-1.5">
            <Eye className="h-3.5 w-3.5" aria-hidden="true" /> Who has access
          </h3>
          {panel.access.length === 0 ? (
            <p className="text-xs text-ink-500">Only you. No active investor links, mentor grants or team members.</p>
          ) : (
            <ul className="text-sm text-ink-800 space-y-1">
              {panel.access.map((a, i) => (
                <li key={`${a.kind}-${i}`} className="flex flex-wrap items-baseline gap-x-2" data-access-kind={a.kind}>
                  <span className="font-medium">{a.label}</span>
                  {a.detail ? <span className="text-xs text-ink-500">{a.detail}</span> : null}
                  {a.until ? <span className="text-xs text-ink-500">until {fmt(a.until)}</span> : null}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs">
            <Link href={panel.links.revokeAccess} className="text-brand-700 underline decoration-dotted underline-offset-4">
              Revoke an investor link
            </Link>
            {" · "}
            <Link href={panel.links.revokeMentors} className="text-brand-700 underline decoration-dotted underline-offset-4">
              Revoke mentor access
            </Link>
          </p>
        </div>

        {/* What was shared */}
        <div className="space-y-2" data-testid="data-ethics-shared">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500 flex items-center gap-1.5">
            <Share2 className="h-3.5 w-3.5" aria-hidden="true" /> What was shared
          </h3>
          {panel.shared.length === 0 ? (
            <p className="text-xs text-ink-500">No share link has been opened yet.</p>
          ) : (
            <ul className="text-sm text-ink-800 space-y-1">
              {panel.shared.map((s, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium">{s.label}</span>
                  <span className="text-xs text-ink-500 tabular-nums">
                    {s.views} {s.views === 1 ? "open" : "opens"} · last {fmt(s.lastViewedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Last refreshed */}
        <div className="space-y-2" data-testid="data-ethics-refreshed">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500 flex items-center gap-1.5">
            <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" /> Last refreshed
          </h3>
          <p className="text-sm text-ink-800">
            Last analysis: <span className="font-medium" data-last-analysis>{fmt(panel.lastAnalysisAt)}</span>
          </p>
          {panel.refreshed.length === 0 ? (
            <p className="text-xs text-ink-500">
              No connector linked. <Link href={panel.links.connectors} className="underline">Connect a source</Link> so figures refresh themselves.
            </p>
          ) : (
            <ul className="text-sm text-ink-800 space-y-1">
              {panel.refreshed.map((r) => (
                <li key={r.label} className="flex flex-wrap items-center gap-x-2" data-refresh-status={r.status}>
                  <span className="font-medium">{r.label}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_CLASS[r.status]}`}>{r.status}</span>
                  <span className="text-xs text-ink-500">{r.note ?? fmt(r.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
