// G35 A2 (pricing v5 §7.4) — /admin/ai-health cards: model scorecard per task
// (primary vs challenger, quality, cost per accepted output, p95, last eval,
// detail per language / section) and the routing-policy diff with
// Approve / Dismiss / Rollback. Server component: reads the runtime JSON the
// model-eval cron + coordinator write; the buttons are a small client island.

import * as fs from "fs";
import { runtimeReportsPath } from "@/lib/runtime-paths";
import { SCORECARD_FILE_NAME, effectivePaidLadder, type Scorecard, type TaskCard } from "@/lib/ai/model-coordinator";
import type { TaskModelScore } from "@/lib/ai/model-eval-scoring";
import { PAID_POLICY_CLASSES, ROUTING_POLICY_HISTORY_FILE_NAME, readRoutingPolicyFresh, type PaidPolicyClass, type RoutingPolicy } from "@/lib/ai/routing-policy";
import { EVAL_TASK_IDS, TASK_PROFILES } from "@/lib/ai/task-profiles";
import { DEEPINFRA_MODELS_BY_CLASS } from "@/lib/ai-client";
import { RoutingPolicyActions } from "./routing-policy-actions";

function readJson<T>(name: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(runtimeReportsPath(name), "utf-8")) as T;
  } catch {
    return null;
  }
}

function readHistory(limit = 8): Array<Record<string, unknown>> {
  try {
    const lines = fs.readFileSync(runtimeReportsPath(ROUTING_POLICY_HISTORY_FILE_NAME), "utf-8").trim().split("\n").slice(-limit);
    return lines.flatMap((l) => {
      try {
        return [JSON.parse(l) as Record<string, unknown>];
      } catch {
        return [];
      }
    }).reverse();
  } catch {
    return [];
  }
}

const TH = "text-left text-[11px] font-semibold uppercase tracking-wider text-secondary [&_th]:border-b [&_th]:border-line-subtle [&_th]:bg-surface-sunken [&_th]:py-2 [&_th]:pr-3";
const ago = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString() : "never");
const usd = (n: number | null | undefined, dp = 5) => (n === null || n === undefined ? "—" : `US$${n.toFixed(dp)}`);
const pct = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${Math.round(n * 100)}%`);
const secs = (ms: number | null | undefined) => (ms === null || ms === undefined ? "—" : `${(ms / 1000).toFixed(1)} s`);
const short = (m: string) => m.split("/").pop() ?? m;

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

function ModelCell({ row, label, wins }: { row: TaskModelScore | undefined; label: string; wins?: number }) {
  if (!row) return <span className="text-ink-400">—</span>;
  return (
    <div className="space-y-0.5">
      <div className="font-mono text-xs text-ink-800" title={`${row.provider}:${row.model}`}>
        {row.provider}/{short(row.model)}
        {row.billing === "free" ? <span className="ml-1 rounded bg-emerald-50 px-1 text-[10px] text-emerald-700">free</span> : null}
      </div>
      <div className="text-[11px] text-ink-600">
        {label} · q {row.quality.toFixed(3)} · {usd(row.costPerAccepted)}/accepted · p95 {secs(row.p95LatencyMs)}
      </div>
      <div className="text-[11px] text-ink-500">
        accept {pct(row.acceptRate)} · schema fail {pct(row.schemaFailRate)}
        {row.groundedShare !== null ? ` · grounded ${row.groundedShare}` : ""}
        {row.criticalErrors ? <span className="text-red-700"> · {row.criticalErrors} critical</span> : ""}
        {row.judge.mean !== null ? ` · judge ${row.judge.mean} (n ${row.judge.n})` : ""}
        {wins !== undefined ? ` · wins ${wins}/2` : ""}
      </div>
      {!row.passesProfile && <div className="text-[11px] text-amber-700">{row.failReasons.join("; ")}</div>}
    </div>
  );
}

function TaskDetail({ card }: { card: TaskCard }) {
  if (card.models.length === 0) return null;
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-[11px] text-brand-600">Detail: {card.models.length} model(s), per language / section</summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className={TH}>
            <tr><th>Model</th><th>n</th><th>Quality</th><th>Accept</th><th>Schema fail</th><th>p95</th><th>Cost/accepted</th><th>EN q</th><th>VI q</th><th>Sections (q)</th></tr>
          </thead>
          <tbody className="[&>tr:nth-child(even)]:bg-surface-sunken">
            {card.models.map((r) => (
              <tr key={`${r.provider}:${r.model}`} className="border-t border-surface-200 align-top">
                <td className="py-1 pr-3 font-mono">{r.provider}/{short(r.model)}</td>
                <td className="py-1 pr-3 tabular-nums">{r.n}</td>
                <td className="py-1 pr-3 tabular-nums">{r.quality.toFixed(3)}</td>
                <td className="py-1 pr-3 tabular-nums">{pct(r.acceptRate)}</td>
                <td className="py-1 pr-3 tabular-nums">{pct(r.schemaFailRate)}</td>
                <td className="py-1 pr-3 tabular-nums">{secs(r.p95LatencyMs)}</td>
                <td className="py-1 pr-3 tabular-nums">{usd(r.costPerAccepted)}</td>
                <td className="py-1 pr-3 tabular-nums">{r.byLanguage.en ? r.byLanguage.en.quality.toFixed(2) : "—"}</td>
                <td className="py-1 pr-3 tabular-nums">{r.byLanguage.vi ? r.byLanguage.vi.quality.toFixed(2) : "—"}</td>
                <td className="py-1 pr-3 text-ink-600">{Object.entries(r.bySection).map(([k, v]) => `${k} ${v.quality.toFixed(2)}`).join(" · ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function ScorecardCard({ sc }: { sc: Scorecard | null }) {
  if (!sc) {
    return (
      <Card title="Model scorecard">
        <p className="text-sm text-ink-500">
          No eval yet — <code>/api/cron/model-eval</code> (nightly smoke 18:53 UTC, weekly full Sun 05:00 UTC) writes <code>content/reports/{SCORECARD_FILE_NAME}</code>.
        </p>
      </Card>
    );
  }
  const lf = sc.last_full;
  const ls = sc.last_smoke;
  return (
    <Card
      title="Model scorecard (primary vs challenger)"
      subtitle={`Full ${lf ? `${ago(lf.finished_at)} · ${lf.status} · US$${lf.spent_usd.toFixed(4)}` : "never"} · Smoke ${ls ? `${ago(ls.finished_at)} · US$${ls.spent_usd.toFixed(4)}` : "never"}`}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className={TH}>
            <tr><th>Task</th><th>Primary</th><th>Challenger</th><th>Last eval</th></tr>
          </thead>
          <tbody className="[&>tr:nth-child(even)]:bg-surface-sunken">
            {EVAL_TASK_IDS.map((task) => {
              const card = sc.tasks[task];
              const p = TASK_PROFILES[task];
              const primary = card?.primary ? card.models.find((r) => r.provider === card.primary!.provider && r.model === card.primary!.model) : undefined;
              const challenger = card?.challenger ? card.models.find((r) => r.provider === card.challenger!.provider && r.model === card.challenger!.model) : undefined;
              const smokeDead = card?.smoke.filter((s) => s.dead).map((s) => `${s.provider}/${short(s.model)}`) ?? [];
              return (
                <tr key={task} className="border-t border-surface-200 align-top">
                  <td className="py-2 pr-3">
                    <div className="font-medium text-ink-800">{p.label}</div>
                    <div className="text-[11px] text-ink-500">
                      {p.reportScope ? "report scope · DeepInfra only · paid = proposal" : p.dispatcherClass ? `ladder: ${p.dispatcherClass}` : "scorecard only"}
                    </div>
                    {card ? <TaskDetail card={card} /> : null}
                  </td>
                  <td className="py-2 pr-3"><ModelCell row={primary} label={card?.primary?.source === "approved_policy" ? "approved" : "catalogue"} /></td>
                  <td className="py-2 pr-3"><ModelCell row={challenger} label="challenger" wins={card?.challenger?.wins} /></td>
                  <td className="py-2 pr-3 text-xs text-ink-600">
                    <div>full {ago(card?.last_full_eval)}</div>
                    <div>smoke {ago(card?.last_smoke_eval)}</div>
                    {smokeDead.length > 0 && <div className="text-red-700">dead on smoke: {smokeDead.join(", ")}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {sc.providers.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-brand-600">Cost per accepted output by provider + task (latest full run)</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className={TH}><tr><th>Task</th><th>Provider</th><th>Models</th><th>Cases</th><th>Accepted</th><th>Quality</th><th>Spend</th><th>Cost/accepted</th></tr></thead>
              <tbody className="[&>tr:nth-child(even)]:bg-surface-sunken">
                {sc.providers.map((r) => (
                  <tr key={`${r.task}:${r.provider}`} className="border-t border-surface-200">
                    <td className="py-1 pr-3">{TASK_PROFILES[r.task]?.label ?? r.task}</td>
                    <td className="py-1 pr-3">{r.provider}</td>
                    <td className="py-1 pr-3 tabular-nums">{r.models}</td>
                    <td className="py-1 pr-3 tabular-nums">{r.cases}</td>
                    <td className="py-1 pr-3 tabular-nums">{r.accepted}</td>
                    <td className="py-1 pr-3 tabular-nums">{r.quality.toFixed(3)}</td>
                    <td className="py-1 pr-3 tabular-nums">{usd(r.costUsd, 4)}</td>
                    <td className="py-1 pr-3 tabular-nums">{usd(r.costPerAccepted)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      {Object.keys(sc.live).length > 0 && (
        <p className="mt-3 text-xs text-ink-600">
          Live grounding (last ≤ 20 report sections per model):{" "}
          {Object.entries(sc.live).map(([k, v]) => `${short(k)} ${v.share ?? "—"} (${v.grounded}/${v.sections})`).join(" · ")}
        </p>
      )}
      {sc.decisions.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-ink-700">
          {sc.decisions.map((d, i) => (
            <li key={i}>
              <span className="font-semibold">{d.kind.replace("_", " ")}</span> {d.provider}/{short(d.model)} — {d.outcome} · {d.reason}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function LadderDiff({ cls, current, proposed }: { cls: PaidPolicyClass; current: string[]; proposed: string[] | undefined }) {
  return (
    <tr className="border-t border-surface-200 align-top">
      <td className="py-2 pr-3 font-medium">{cls}</td>
      <td className="py-2 pr-3 font-mono text-xs">{current.map((m, i) => <div key={m}>{i + 1}. {short(m)}</div>)}</td>
      <td className="py-2 pr-3 font-mono text-xs">
        {proposed ? proposed.map((m, i) => <div key={m} className={current[i] !== m ? "font-semibold text-brand-700" : ""}>{i + 1}. {short(m)}</div>) : <span className="text-ink-400">no change</span>}
      </td>
    </tr>
  );
}

function PolicyCard({ policy, history }: { policy: RoutingPolicy | null; history: Array<Record<string, unknown>> }) {
  const defaults = { report: DEEPINFRA_MODELS_BY_CLASS.report, synthesis: DEEPINFRA_MODELS_BY_CLASS.synthesis, classify: DEEPINFRA_MODELS_BY_CLASS.classify };
  const prop = policy?.paid.proposal ?? null;
  const active = policy?.paid.active ?? null;
  const freeProviders = Object.entries(policy?.free?.providers ?? {}).filter(([, v]) => v.promoted.length || v.demoted.length);
  return (
    <Card
      title="Routing policy (ai-routing-policy.json)"
      subtitle={policy ? `Updated ${ago(policy.updated_at)}` : "No policy file — the dispatcher routes exactly as coded"}
    >
      <p className="mb-2 text-xs text-ink-600">
        Paid DeepInfra ladder: <strong>{active ? `approved ${ago(policy?.paid.approved_at)}` : "dispatcher defaults"}</strong>. The coordinator only proposes paid changes; an approve reorders admitted rungs (never adds a model to the report scope).
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className={TH}><tr><th>Class</th><th>In force</th><th>Proposed</th></tr></thead>
          <tbody>
            {PAID_POLICY_CLASSES.map((cls) => (
              <LadderDiff key={cls} cls={cls} current={effectivePaidLadder(policy, cls, defaults)} proposed={prop?.ladders[cls]} />
            ))}
          </tbody>
        </table>
      </div>
      {prop ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">Proposal {prop.id} · {ago(prop.proposed_at)}</p>
          <ul className="mt-1 list-disc pl-5 text-xs">{prop.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          {prop.needs_admission.length > 0 && (
            <p className="mt-1 text-xs text-red-800">
              Not report-admitted yet (founder: catalogue + price policy first — the dispatcher ignores them in the scoped ladder until then): {prop.needs_admission.join(", ")}
            </p>
          )}
          <p className="mt-1 text-[11px]">Evidence runs: {prop.evidence_runs.join(", ")}</p>
        </div>
      ) : (
        <p className="mt-3 text-xs text-ink-500">No pending proposal.</p>
      )}
      <div className="mt-3">
        <RoutingPolicyActions proposalId={prop?.id ?? null} canRollback={Boolean(active)} />
      </div>
      <div className="mt-4">
        <h3 className="text-xs font-semibold text-ink-700">Free ladders (automatic)</h3>
        {freeProviders.length === 0 ? (
          <p className="text-xs text-ink-500">No free-ladder changes{policy?.free ? ` (confirmed ${ago(policy.free.updated_at)})` : ""}.</p>
        ) : (
          <ul className="mt-1 space-y-0.5 text-xs text-ink-700">
            {freeProviders.map(([p, v]) => (
              <li key={p} className="font-mono">
                {p}: {v.promoted.length ? `promoted ${v.promoted.map(short).join(", ")}` : ""}{v.promoted.length && v.demoted.length ? " · " : ""}{v.demoted.length ? `skipped ${v.demoted.map(short).join(", ")}` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
      {history.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-brand-600">Policy history (latest {history.length})</summary>
          <ul className="mt-1 space-y-0.5 text-[11px] text-ink-600">
            {history.map((h, i) => (
              <li key={i} className="font-mono">{String(h.ts ?? "")} · {String(h.action ?? "")} · {String(h.actor ?? "")}{h.provider ? ` · ${String(h.provider)}` : ""}{h.proposal_id ? ` · ${String(h.proposal_id)}` : ""}</li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

/** The two A2 cards, in reading order. */
export function AIScorecardCards() {
  const sc = readJson<Scorecard>(SCORECARD_FILE_NAME);
  const policy = readRoutingPolicyFresh();
  return (
    <div className="space-y-6">
      <ScorecardCard sc={sc} />
      <PolicyCard policy={policy} history={readHistory()} />
    </div>
  );
}
