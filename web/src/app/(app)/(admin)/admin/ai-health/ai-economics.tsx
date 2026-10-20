// G35 A1 + A3 (pricing v5 §7.4) — /admin/ai-health cards: balances + runway,
// price feed + report price-policy countdown + renewal proposal, model
// catalogue. Server component: reads the runtime JSON the crons write
// (ai-balances.json hourly, ai-price-feed.json nightly) — no client JS.

import * as fs from "fs";
import { runtimeReportsPath } from "@/lib/runtime-paths";
import { MODEL_CATALOG, catalogPrice } from "@/lib/ai/model-catalog";
import type { BalancesSnapshot, ProviderBalance, BalanceLevel } from "@/lib/ai/balances";
import type { PriceComparison, RenewalProposal } from "@/lib/ai/price-feed";
import { REPORT_PRICE_POLICY, REPORT_PRICE_POLICY_EXPIRES_AT } from "@/lib/ai/report-attempt-budget";
import { reportPricePolicyExpiryStatus } from "@/lib/ai/report-price-policy-alert";

interface PriceFeedFile {
  generated_at: string;
  threshold_pct: number;
  comparisons: PriceComparison[];
  summary: { checked: number; unchanged: number; drift_minor: number; changed: number; missing: number; feed_errors: number };
  feeds: Record<string, { ok: boolean; error?: string; totalModels: number }>;
}

function readJson<T>(name: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(runtimeReportsPath(name), "utf-8")) as T;
  } catch {
    return null;
  }
}

const LEVEL_STYLE: Record<BalanceLevel, string> = {
  ok: "bg-emerald-50 text-emerald-800 border-emerald-200",
  warn: "bg-amber-50 text-amber-800 border-amber-200",
  critical: "bg-red-50 text-red-800 border-red-200",
  unknown: "bg-surface-100 text-ink-600 border-surface-200",
};

function LevelBadge({ level }: { level: BalanceLevel }) {
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${LEVEL_STYLE[level]}`}>{level}</span>;
}

const usd = (n: number | null | undefined, dp = 2) => (n === null || n === undefined ? "—" : `US$${n.toFixed(dp)}`);
const ago = (iso: string | undefined) => (iso ? new Date(iso).toLocaleString() : "never");

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-surface-200 rounded-xl p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink-800">{title}</h2>
        {subtitle ? <span className="text-xs text-ink-500">{subtitle}</span> : null}
      </div>
      {children}
    </section>
  );
}

const TH = "text-left text-[11px] font-semibold uppercase tracking-wider text-secondary [&_th]:border-b [&_th]:border-line-subtle [&_th]:bg-surface-sunken [&_th]:py-2 [&_th]:pr-3";

function BalancesCard({ snap }: { snap: BalancesSnapshot | null }) {
  if (!snap) {
    return (
      <Card title="AI balances + runway">
        <p className="text-sm text-ink-500">No balance snapshot yet — the hourly <code>/api/cron/ai-balance</code> job writes <code>content/reports/ai-balances.json</code>.</p>
      </Card>
    );
  }
  const rows = Object.values(snap.providers) as ProviderBalance[];
  const t = snap.thresholds;
  return (
    <Card title="AI balances + runway" subtitle={`Updated ${ago(snap.updated_at)} · warn < ${t.warn_days} d or < US$${t.warn_usd} · critical < ${t.critical_days} d or < US$${t.critical_usd}`}>
      {(snap.flags.deepinfra_critical || snap.flags.openrouter_paid_disabled) && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {snap.flags.deepinfra_critical && <p><strong>DeepInfra critical:</strong> report jobs are queued (not failed, no provider switch); other AI calls run on the free tier only. {snap.flags.reasons?.deepinfra_critical}</p>}
          {snap.flags.openrouter_paid_disabled && <p><strong>OpenRouter critical:</strong> paid OpenRouter models are off; <code>:free</code> models keep serving. {snap.flags.reasons?.openrouter_paid_disabled}</p>}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className={TH}>
            <tr><th>Provider</th><th>Level</th><th>Balance</th><th>Burn / day ({t.burn_window_days} d)</th><th>Runway</th><th>Why</th></tr>
          </thead>
          <tbody className="[&>tr:nth-child(even)]:bg-surface-sunken">
            {rows.map((p) => (
              <tr key={p.provider} className="border-t border-surface-200 align-top">
                <td className="py-2 pr-3 font-medium">{p.provider}<div className="text-[11px] font-normal text-ink-500">{p.kind.replace("_", " ")}</div></td>
                <td className="py-2 pr-3"><LevelBadge level={p.level} /></td>
                <td className="py-2 pr-3 tabular-nums">{p.kind === "free_tier" ? "free tier" : usd(p.balance_usd)}{p.kind === "monthly_budget" && p.details ? <div className="text-[11px] text-ink-500">of {usd(Number(p.details.monthly_budget_usd))} / month</div> : null}</td>
                <td className="py-2 pr-3 tabular-nums">{p.burn_usd_per_day === null ? "—" : usd(p.burn_usd_per_day, 4)}</td>
                <td className="py-2 pr-3 tabular-nums">{p.runway_days === null ? "—" : `${p.runway_days.toFixed(1)} d`}</td>
                <td className="py-2 pr-3 text-xs text-ink-600">{p.reasons.join("; ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function PriceCard({ feed, renewal, now }: { feed: PriceFeedFile | null; renewal: RenewalProposal | null; now: number }) {
  const policy = reportPricePolicyExpiryStatus(REPORT_PRICE_POLICY_EXPIRES_AT, now);
  const flagged = feed ? feed.comparisons.filter((c) => c.status !== "unchanged" || c.deprecated || c.discountEndsAt) : [];
  return (
    <Card title="Price feed + report price policy" subtitle={feed ? `Feed checked ${ago(feed.generated_at)} · alert threshold > ${feed.threshold_pct}%` : "Feed not synced yet (02:13 UTC nightly)"}>
      <div className={`mb-3 rounded-lg border p-3 text-sm ${policy.expired ? "border-red-200 bg-red-50 text-red-800" : policy.warn ? "border-amber-200 bg-amber-50 text-amber-800" : "border-surface-200 bg-surface-50 text-ink-700"}`}>
        Policy <code>{REPORT_PRICE_POLICY}</code> expires <strong>{new Date(REPORT_PRICE_POLICY_EXPIRES_AT).toUTCString()}</strong> —{" "}
        {policy.expired ? "EXPIRED: every report-scoped call is refused." : `${policy.daysLeft.toFixed(1)} days left.`}
      </div>
      {renewal && (
        <div className={`mb-3 rounded-lg border p-3 text-sm ${renewal.status === "proposed" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-800"}`}>
          <p className="font-semibold">
            {renewal.status === "proposed" ? `Renewal proposal ready → ${renewal.proposed_expires_at}` : renewal.status === "blocked_price_changed" ? "No renewal: an admitted price changed" : "No renewal: feed did not confirm every admitted price"}
          </p>
          <p className="text-xs">{renewal.approval} Generated {ago(renewal.generated_at)}.</p>
          <ul className="mt-2 space-y-0.5 text-xs">
            {renewal.evidence.map((e) => (
              <li key={e.model} className="font-mono">
                {e.unchanged ? "=" : "≠"} {e.model}: pinned {e.pinned_usd_per_1m.in}/{e.pinned_usd_per_1m.out} · feed {e.feed_usd_per_1m ? `${e.feed_usd_per_1m.in}/${e.feed_usd_per_1m.out}` : "—"}
              </li>
            ))}
          </ul>
          <ol className="mt-2 list-decimal pl-5 text-xs">{renewal.apply_steps.map((s) => <li key={s}>{s}</li>)}</ol>
        </div>
      )}
      {feed ? (
        <>
          <p className="mb-2 text-xs text-ink-600">
            {feed.summary.checked} checked · {feed.summary.unchanged} unchanged · {feed.summary.drift_minor} minor drift · {feed.summary.changed} changed · {feed.summary.missing} missing · {feed.summary.feed_errors} feed errors
          </p>
          {flagged.length === 0 ? (
            <p className="text-sm text-ink-500">Every catalogued price matches its public feed.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className={TH}><tr><th>Model</th><th>Catalogue</th><th>Feed</th><th>Change</th><th>Note</th></tr></thead>
                <tbody className="[&>tr:nth-child(even)]:bg-surface-sunken">
                  {flagged.map((c) => (
                    <tr key={`${c.provider}:${c.id}`} className="border-t border-surface-200">
                      <td className="py-2 pr-3 font-mono text-xs">{c.provider}/{c.id}{c.admitted ? <span className="ml-1 rounded bg-brand-50 px-1 text-[10px] text-brand-700">admitted</span> : null}</td>
                      <td className="py-2 pr-3 tabular-nums">{c.catalog.in}/{c.catalog.out}</td>
                      <td className="py-2 pr-3 tabular-nums">{c.feed ? `${c.feed.in}/${c.feed.out}` : "—"}</td>
                      <td className="py-2 pr-3">{c.status}{c.changePct ? ` (${c.changePct}%)` : ""}</td>
                      <td className="py-2 pr-3 text-xs text-ink-600">{c.deprecated ? `deprecated${c.replacedBy ? ` → ${c.replacedBy}` : ""}` : c.discountEndsAt ? `promo ends ${new Date(c.discountEndsAt).toUTCString()}` : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </Card>
  );
}

const ROLE_LABEL: Record<string, string> = {
  report_chapter: "report", ceo_synthesis: "CEO synth", grounding_judge: "judge", extraction_classify: "extract", translation: "EN↔VI", chat: "chat", vision: "vision",
};

function CatalogueCard() {
  return (
    <Card title={`Model catalogue (${MODEL_CATALOG.length})`} subtitle="src/lib/ai/model-catalog.ts · USD per 1M tokens in/out">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className={TH}><tr><th>Provider</th><th>Model</th><th>Task roles</th><th>Admitted</th><th>Price</th><th>Context</th><th>Verified</th></tr></thead>
          <tbody className="[&>tr:nth-child(even)]:bg-surface-sunken">
            {MODEL_CATALOG.map((m) => {
              const p = catalogPrice(m);
              return (
                <tr key={`${m.provider}:${m.id}`} className="border-t border-surface-200 align-top">
                  <td className="py-2 pr-3">{m.provider}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{m.id}</td>
                  <td className="py-2 pr-3 text-xs">{m.roles.length === 0 ? <span className="text-ink-400">—</span> : m.roles.map((r) => `${ROLE_LABEL[r.role] ?? r.role} (${r.tier.replace("_", " ")})`).join(", ")}</td>
                  <td className="py-2 pr-3">{m.admitted ? <span className="font-semibold text-emerald-700">yes</span> : <span className="text-ink-400">no</span>}</td>
                  <td className="py-2 pr-3 tabular-nums">{m.billing === "paid" ? (p ? `${p.in}/${p.out}` : "missing") : m.billing}</td>
                  <td className="py-2 pr-3 tabular-nums text-xs">{Math.round(m.contextTokens / 1024)}K</td>
                  <td className="py-2 pr-3 text-xs text-ink-500">{m.verifiedAt}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** The three A1/A3 cards, in reading order. */
export function AIEconomicsCards({ now }: { now: number }) {
  const balances = readJson<BalancesSnapshot>("ai-balances.json");
  const feed = readJson<PriceFeedFile>("ai-price-feed.json");
  // A proposal for an expiry that has since been extended is history, not an action.
  const proposal = readJson<RenewalProposal>("ai-price-policy-renewal.json");
  const renewal = proposal && proposal.current_expires_at === REPORT_PRICE_POLICY_EXPIRES_AT ? proposal : null;
  return (
    <div className="space-y-6">
      <BalancesCard snap={balances} />
      <PriceCard feed={feed} renewal={renewal} now={now} />
      <CatalogueCard />
    </div>
  );
}
