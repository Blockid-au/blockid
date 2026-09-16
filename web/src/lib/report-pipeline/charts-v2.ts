// charts-v2 — deterministic `VisualSpecV2` builders for the W4 dimension
// chapters (spec §C.4 / §C.11, decision D7: every chart is data → SVG).
//
// `generateChartsV2(ctx, draft)` builds the primary + secondary visuals of a
// chapter from MODULE OUTPUTS and EVIDENCE NUMBERS — never from LLM prose.
// The owner agent may PROPOSE a visual (`primary_visual` in its payload);
// it is accepted only when (1) its kind is in `DIMENSION_OWNERS[dim]
// .allowedVisuals` and (2) every number in its series passes the
// number-provenance pass (present in the module outputs / evidence rows /
// benchmark ± rounding). A failed pass downgrades `data_state` to `partial`
// and the deterministic builder supplies the data instead.
//
// Re-exported from chart-generator.ts (the pipeline entry point).
// Pure: no I/O.

import type { CriterionKey } from "@/lib/evaluation-criteria";
import type { EvidenceRow } from "@/lib/report-v2/schema";
import { makeVisual, type ChartTypeV2, type DataState, type VisualSpecV2 } from "@/lib/report-visuals";
import { ALL_VISUAL_KINDS } from "@/lib/report-visuals/types";
import { DIMENSION_OWNERS, type DimKey } from "./dimension-owners";
import { moduleNumbers, type ModuleOutput } from "./module-precompute";
import type { AgentRole } from "./types";

// ── Inputs ──────────────────────────────────────────────────────────────────

/** The visual an owner agent proposed in its chapter payload (§C.11). */
export interface LlmVisualProposal {
  kind: string;
  data_state?: string;
  title?: string;
  series: Array<{ label: string; value?: number; points?: number[] }>;
}

export interface ChapterVisualDraft {
  dim: DimKey;
  ownerAgent: AgentRole;
  /** Deterministic dimension score (computeSVI), null when unscored. */
  score: number | null;
  benchmark: { p25: number; p50: number; p75: number };
  stageLabel: string;
  criterionScore: (key: CriterionKey) => number | null;
  moduleOutputs: ModuleOutput[];
  evidence: EvidenceRow[];
  proposedPrimary?: LlmVisualProposal | null;
  proposedSecondary?: LlmVisualProposal[] | null;
}

export interface ProvenanceReport {
  /** Numbers the proposal carried. */
  checked: number;
  /** Numbers not traceable to the inputs (± rounding). */
  unresolved: number[];
  /** True when the proposal was rejected / downgraded. */
  downgraded: boolean;
}

export interface ChartsV2Result {
  primary: VisualSpecV2;
  secondary: VisualSpecV2[];
  provenance: ProvenanceReport;
}

// ── Number provenance ───────────────────────────────────────────────────────

/**
 * Every finite number in the evidence rows (`value` strings parsed, e.g.
 * "A$12,400 MRR" → 12400). W2 review (c): a URL's digit runs
 * ("…/2024/q3/…") and upload file sizes ("(pdf, 48213 bytes)") are NOT
 * evidence numbers — they licensed fabricated series before.
 */
export function evidenceNumbers(rows: EvidenceRow[]): number[] {
  const out: number[] = [];
  rows.forEach((r) => {
    const raw = (r.value ?? "").trim();
    if (!raw || /^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return;
    const cleaned = raw
      .replace(/[a-z][a-z0-9+.-]*:\/\/\S+/gi, " ") // embedded URLs
      .replace(/\(?[\d,]+\s*(?:bytes|kb|mb)\)?/gi, " ") // file sizes
      .replace(/,/g, "");
    const m = cleaned.match(/-?\d+(?:\.\d+)?/g) ?? [];
    m.forEach((t) => {
      const n = Number(t);
      if (Number.isFinite(n)) out.push(n);
    });
  });
  return out;
}

/** Numbers a proposal carries (values + points), in order. */
function proposalNumbers(proposal: LlmVisualProposal): number[] {
  const nums: number[] = [];
  proposal.series.forEach((s) => {
    if (typeof s.value === "number" && Number.isFinite(s.value)) nums.push(s.value);
    (s.points ?? []).forEach((p) => {
      if (Number.isFinite(p)) nums.push(p);
    });
  });
  return nums;
}

/** True when `n` matches some universe value within rounding (0.5 abs or 1 %). */
export function numberTraceable(n: number, universe: number[]): boolean {
  return universe.some((u) => Math.abs(n - u) <= Math.max(0.5, Math.abs(u) * 0.01));
}

/** Deterministic number-provenance pass over a proposal. */
export function checkProvenance(proposal: LlmVisualProposal, universe: number[]): ProvenanceReport {
  const nums = proposalNumbers(proposal);
  const unresolved = nums.filter((n) => !numberTraceable(n, universe));
  return { checked: nums.length, unresolved, downgraded: unresolved.length > 0 };
}

/**
 * The provenance universe (W2 review (c)): evidence-row numbers + MEASURED
 * module fields + the deterministic score and the three benchmark
 * percentiles the owner was explicitly given. Static profile constants,
 * weights, URL digit runs and file sizes are excluded.
 */
export function universeFor(draft: ChapterVisualDraft): number[] {
  const u = [...moduleNumbers(draft.moduleOutputs, { measuredOnly: true }), ...evidenceNumbers(draft.evidence), draft.benchmark.p25, draft.benchmark.p50, draft.benchmark.p75];
  if (typeof draft.score === "number") u.push(draft.score);
  return u;
}

function isAllowedKind(dim: DimKey, kind: string): kind is ChartTypeV2 {
  return (ALL_VISUAL_KINDS as readonly string[]).includes(kind) && (DIMENSION_OWNERS[dim].allowedVisuals as readonly string[]).includes(kind);
}

/** `real` needs at least one series number that traces to an EVIDENCE row (not just a module field). */
function clampState(claimed: string | undefined, hasEvidenceNumber: boolean): DataState {
  const s = claimed === "real" || claimed === "partial" || claimed === "benchmark_only" || claimed === "target" ? claimed : "partial";
  return s === "real" && !hasEvidenceNumber ? "partial" : s;
}

// ── Proposal → spec data (generic series → kind-specific shape) ─────────────

/** Map a validated proposal onto the data shape of its kind; null when the kind needs richer data. */
export function proposalToData(kind: ChartTypeV2, proposal: LlmVisualProposal, max = 100): Record<string, unknown> | null {
  const pairs = proposal.series.filter((s) => typeof s.value === "number").map((s) => ({ label: s.label, value: s.value as number }));
  const first = proposal.series[0];
  if (kind === "bar") return pairs.length ? { bars: pairs, max } : null;
  if (kind === "donut" || kind === "pie") return pairs.length ? { slices: pairs } : null;
  if (kind === "funnel") return pairs.length ? { stages: pairs } : null;
  if (kind === "radar") return pairs.length >= 3 ? { axes: pairs, max } : null;
  if (kind === "progress") return pairs.length ? { value: pairs[0].value, max, label: pairs[0].label } : null;
  if (kind === "gauge") return pairs.length ? { value: pairs[0].value, max, label: pairs[0].label } : null;
  if (kind === "line") {
    const series = proposal.series.filter((s) => Array.isArray(s.points) && s.points.length > 1).map((s) => ({ label: s.label, points: s.points as number[] }));
    return series.length ? { series } : null;
  }
  if (kind === "sparkline") {
    const pts = first && Array.isArray(first.points) ? first.points : pairs.map((p) => p.value);
    return pts.length > 1 ? { points: pts.map((v) => ({ value: v })) } : null;
  }
  return null;
}

// ── Deterministic builders (module outputs + criterion scores) ──────────────

function moduleValue(outputs: ModuleOutput[], idIncludes: string, key: string): number | null {
  const m = outputs.find((o) => o.id.includes(idIncludes));
  const v = m?.output[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function moduleField(outputs: ModuleOutput[], idIncludes: string, key: string): unknown {
  return outputs.find((o) => o.id.includes(idIncludes))?.output[key];
}

function deterministicVisuals(d: ChapterVisualDraft): { primary: VisualSpecV2; secondary: VisualSpecV2[] } {
  const owner = DIMENSION_OWNERS[d.dim];
  const cs = d.criterionScore;
  const score = d.score ?? 0;
  const { p25, p50, p75 } = d.benchmark;
  const bandLabel = `${d.stageLabel} cohort p25–p75`;
  const base = { dim: d.dim, agentId: owner.primary } as const;
  const hasEv = d.evidence.length > 0;

  if (d.dim === "tre") {
    const mrr = moduleValue(d.moduleOutputs, "traction", "mrrAud");
    const primary = makeVisual({
      ...base,
      id: "dim-tre-primary",
      kind: "sparkline",
      title: "Monthly revenue, last 12 months",
      subtitle: mrr !== null ? `Stated MRR A$${Math.round(mrr).toLocaleString("en-AU")} — connect Stripe / Xero to plot the series` : "No revenue connector — cohort band and your TRE score shown instead",
      dataState: "benchmark_only",
      data: { points: [], ghost: true, ghostLabel: "Connect Stripe / Xero to plot revenue", band: { low: p25, high: p75, label: bandLabel }, marker: { label: "TRE", value: score } },
      a11y: { tableFallback: [{ metric: "TRE score", value: score }, { metric: "Cohort p25", value: p25 }, { metric: "Cohort p50", value: p50 }, { metric: "Cohort p75", value: p75 }, ...(mrr !== null ? [{ metric: "Stated MRR (A$)", value: Math.round(mrr) }] : [])] },
    });
    // S-R5: a GA4 snapshot turns the funnel into real AARRR counts (sessions →
    // engaged → returning → conversions); without one it stays the criterion-score funnel.
    const ga4Sessions = moduleValue(d.moduleOutputs, "aarrrFunnel", "sessions");
    const funnel =
      ga4Sessions !== null
        ? makeVisual({
            ...base,
            id: "dim-tre-funnel",
            kind: "funnel",
            title: `AARRR funnel — GA4, last ${moduleValue(d.moduleOutputs, "aarrrFunnel", "windowDays") ?? 90} days`,
            subtitle: `Sessions → engaged sessions → returning users → conversions (engagement ${moduleValue(d.moduleOutputs, "aarrrFunnel", "engagementRatePct") ?? 0} %, returning ${moduleValue(d.moduleOutputs, "aarrrFunnel", "returningSharePct") ?? 0} %)`,
            dataState: "real",
            data: {
              stages: [
                { label: "Acquisition (sessions)", value: ga4Sessions },
                { label: "Activation (engaged)", value: moduleValue(d.moduleOutputs, "aarrrFunnel", "engagedSessions") ?? 0 },
                { label: "Retention (returning users)", value: moduleValue(d.moduleOutputs, "aarrrFunnel", "returningUsers") ?? 0 },
                { label: "Revenue (conversions)", value: moduleValue(d.moduleOutputs, "aarrrFunnel", "conversions") ?? 0 },
              ],
              unit: "",
            },
            a11y: { tableFallback: [{ stage: "sessions", value: ga4Sessions }, { stage: "engaged_sessions", value: moduleValue(d.moduleOutputs, "aarrrFunnel", "engagedSessions") ?? 0 }, { stage: "returning_users", value: moduleValue(d.moduleOutputs, "aarrrFunnel", "returningUsers") ?? 0 }, { stage: "conversions", value: moduleValue(d.moduleOutputs, "aarrrFunnel", "conversions") ?? 0 }] },
          })
        : makeVisual({
            ...base,
            id: "dim-tre-funnel",
            kind: "funnel",
            title: "AARRR funnel — criterion scores",
            subtitle: "Market pull → customers → revenue evidence, from the criterion scores; connect GA4 for real session counts",
            dataState: "partial",
            data: { stages: [{ label: "Market", value: cs("market") ?? score }, { label: "Go-to-market", value: cs("gtm_strategy") ?? score }, { label: "Customers", value: cs("customer_size") ?? score }, { label: "Revenue", value: cs("revenue") ?? score }], unit: "/100" },
          });
    return { primary, secondary: [funnel] };
  }

  if (d.dim === "mpc") {
    const primary = makeVisual({
      ...base,
      id: "dim-mpc-primary",
      kind: "funnel",
      title: "Market evidence funnel (criterion scores)",
      subtitle: "Market → go-to-market → idea criterion scores; A$ TAM/SAM/SOM arrives with the sizing module",
      dataState: "partial",
      data: { stages: [{ label: "Market", value: cs("market") ?? score }, { label: "Go-to-market", value: cs("gtm_strategy") ?? score }, { label: "Idea", value: cs("idea") ?? score }], unit: "/100" },
      a11y: { tableFallback: [{ criterion: "market", score: cs("market") ?? score }, { criterion: "gtm_strategy", score: cs("gtm_strategy") ?? score }, { criterion: "idea", score: cs("idea") ?? score }] },
    });
    const twoByTwo = makeVisual({
      ...base,
      id: "dim-mpc-2x2",
      kind: "positioning_2x2",
      title: "Positioning — score vs stage median",
      dataState: "benchmark_only",
      data: { xLabel: "Market pull (MPC score)", yLabel: "Score vs stage p50", points: [{ label: "You", x: score, y: score, self: true }, { label: "Stage p50", x: p50, y: p50 }], quadrants: ["Ahead on evidence", "Category leader", "Early", "Strong score, thin evidence"] },
    });
    // S-R5: GA4 channel mix (top-3 default channel groups) when a snapshot exists.
    const ch1 = moduleField(d.moduleOutputs, "channelMix", "channel1");
    const secondary: VisualSpecV2[] = [twoByTwo];
    if (typeof ch1 === "string") {
      const bars = [1, 2, 3]
        .map((i) => ({ label: String(moduleField(d.moduleOutputs, "channelMix", `channel${i}`) ?? ""), value: moduleValue(d.moduleOutputs, "channelMix", `channel${i}SharePct`) ?? 0 }))
        .filter((b) => b.label);
      secondary.push(
        makeVisual({
          ...base,
          id: "dim-mpc-channels",
          kind: "bar",
          title: "Channel mix — GA4 sessions by default channel group",
          subtitle: `Top ${bars.length} channels, share of ${moduleValue(d.moduleOutputs, "channelMix", "sessions") ?? 0} sessions (last 90 days)`,
          dataState: "real",
          data: { bars, max: 100, unit: "%" },
          a11y: { tableFallback: bars.map((b) => ({ channel: b.label, share_pct: b.value })) },
        }),
      );
    }
    return { primary, secondary };
  }

  if (d.dim === "ftv") {
    const rows: Array<[string, CriterionKey]> = [["Founder profile", "founder_profile"], ["Team composition", "team"], ["Structure & governance", "team_structure"]];
    const primary = makeVisual({
      ...base,
      id: "dim-ftv-primary",
      kind: "heat_map",
      title: "Team completeness — criterion × benchmark",
      subtitle: "Score, gap to p50 and gap to p75 for each founder / team criterion",
      dataState: hasEv ? "partial" : "benchmark_only",
      data: {
        rows: rows.map((r) => r[0]),
        cols: ["Score", "vs p50", "vs p75"],
        cells: rows.map(([, key]) => {
          const s = cs(key);
          return s === null ? [null, null, null] : [s, Math.max(0, 100 - Math.max(0, p50 - s) * 2), Math.max(0, 100 - Math.max(0, p75 - s) * 2)];
        }),
        legend: "Darker = stronger; ? = criterion not scored",
      },
      a11y: { tableFallback: rows.map(([label, key]) => ({ criterion: label, score: cs(key) ?? "not scored" })) },
    });
    const antler = d.moduleOutputs.find((m) => m.id.includes("antler"));
    const antlerBars = antler
      ? Object.entries(antler.output).filter(([k, v]) => typeof v === "number" && k !== "progressionScore").slice(0, 6).map(([k, v]) => ({ label: k, value: v as number, reference: p50 }))
      : rows.map(([label, key]) => ({ label, value: cs(key) ?? 0, reference: p50 }));
    const bars = makeVisual({
      ...base,
      id: "dim-ftv-bars",
      kind: "bar",
      title: antler ? "Founder-market fit — Antler signals" : "Founder-market fit factors",
      dataState: "partial",
      data: { bars: antlerBars, max: 100, referenceLabel: `stage p50 (${p50})` },
    });
    return { primary, secondary: [bars] };
  }

  if (d.dim === "ptd") {
    const primary = makeVisual({
      ...base,
      id: "dim-ptd-primary",
      kind: "bar",
      title: "Product & tech depth vs stage benchmark",
      subtitle: "Repo health bars (commits / tests / CI / deps) arrive when GitHub is connected",
      dataState: "benchmark_only",
      data: { bars: [{ label: "Code & repo", value: cs("code_git") ?? score, reference: p50 }, { label: "Website & UX", value: cs("website") ?? score, reference: p50 }, { label: "Roadmap", value: cs("roadmap") ?? score, reference: p50 }], max: 100, referenceLabel: `stage p50 (${p50})` },
      a11y: { tableFallback: [{ metric: "code_git", score: cs("code_git") ?? score }, { metric: "website", score: cs("website") ?? score }, { metric: "roadmap", score: cs("roadmap") ?? score }, { metric: "stage p50", score: p50 }] },
    });
    const gauge = makeVisual({ ...base, id: "dim-ptd-gauge", kind: "gauge", title: "PTD score gauge", subtitle: "Core Web Vitals gauge arrives with the tech audit", dataState: "benchmark_only", data: { value: score, label: `PTD ${score} / stage p50 ${p50}` } });
    return { primary, secondary: [gauge] };
  }

  if (d.dim === "cgh") {
    const esopDeclared = moduleField(d.moduleOutputs, "governance", "esopAllocated") === true;
    // S-R5: a real equity register (gather.ts capTable → module) draws the actual split.
    const regFounder = moduleValue(d.moduleOutputs, "gather.ts:capTable", "founderPct");
    const regEsop = moduleValue(d.moduleOutputs, "gather.ts:capTable", "esopPct");
    const regInvestor = moduleValue(d.moduleOutputs, "gather.ts:capTable", "investorPct");
    if (regFounder !== null && regFounder + (regEsop ?? 0) + (regInvestor ?? 0) > 0) {
      const founders = Math.round(regFounder);
      const esop = Math.round(regEsop ?? 0);
      const investors = Math.round(regInvestor ?? 0);
      const other = Math.max(0, 100 - founders - esop - investors);
      const slices = [
        { label: "Founders", value: founders },
        { label: "ESOP pool", value: esop },
        { label: "Investors", value: investors },
        ...(other > 0 ? [{ label: "Other", value: other }] : []),
      ];
      const primary = makeVisual({
        ...base,
        id: "dim-cgh-primary",
        kind: "donut",
        title: "Cap-table structure (equity register)",
        subtitle: `From the register: founders ${founders} %, ESOP ${esop} %, investors ${investors} % (${moduleValue(d.moduleOutputs, "gather.ts:capTable", "holders") ?? 0} holders)${moduleField(d.moduleOutputs, "gather.ts:capTable", "vestingFlag") === true ? "; vesting on file" : "; no vesting recorded"}`,
        dataState: "real",
        data: { slices, centreValue: `${founders} %`, centreLabel: "founders" },
        a11y: { tableFallback: slices.map((s) => ({ holder: s.label, pct: s.value })) },
      });
      const dilution = makeVisual({
        ...base,
        id: "dim-cgh-dilution",
        kind: "line",
        title: "Dilution path from the register (2 rounds, 20 % each) — projection",
        dataState: "partial",
        data: { series: [{ label: "Founders %", points: [founders, Math.round(founders * 0.8), Math.round(founders * 0.64)] }, { label: "ESOP %", points: [esop, Math.round(esop * 0.8), Math.round(esop * 0.64)] }], xLabels: ["Now", "Next round", "Round after"], unit: "%" },
      });
      return { primary, secondary: [dilution] };
    }
    const primary = makeVisual({
      ...base,
      id: "dim-cgh-primary",
      kind: "donut",
      title: "Recommended cap-table structure (target, not actual)",
      subtitle: esopDeclared ? "ESOP pool declared, no register — AU seed norm shown: founders 70 %, ESOP 12 %, investors 18 %" : "No cap-table register — AU seed norm shown: founders 70 %, ESOP 12 %, investors 18 %",
      dataState: "target",
      data: { slices: [{ label: "Founders", value: 70 }, { label: "ESOP pool", value: 12 }, { label: "Investors", value: 18 }], centreValue: "target", centreLabel: "not actual" },
      a11y: { tableFallback: [{ holder: "Founders", target_pct: 70 }, { holder: "ESOP pool", target_pct: 12 }, { holder: "Investors", target_pct: 18 }] },
    });
    const dilution = makeVisual({ ...base, id: "dim-cgh-dilution", kind: "line", title: "Dilution path (2 rounds, 20 % each) — target", dataState: "target", data: { series: [{ label: "Founders %", points: [70, 56, 45] }, { label: "ESOP %", points: [12, 10, 8] }], xLabels: ["Now", "Seed", "Series A"], unit: "%" } });
    return { primary, secondary: [dilution] };
  }

  if (d.dim === "iri") {
    const folders = ["Corporate", "Cap table", "Financials", "Contracts", "IP", "Team", "Product", "Compliance"];
    const docs = cs("documents");
    const room = cs("dataroom");
    const primary = makeVisual({
      ...base,
      id: "dim-iri-primary",
      kind: "heat_map",
      title: "Data-room completeness (8 standard folders)",
      subtitle: "Folder-level presence arrives with the data-room connector; documents / dataroom criterion scores shown per folder",
      dataState: "partial",
      data: { rows: folders, cols: ["Documents", "Data room"], cells: folders.map(() => [docs, room]), legend: "? = criterion not scored" },
      a11y: { tableFallback: [{ criterion: "documents", score: docs ?? "not scored" }, { criterion: "dataroom", score: room ?? "not scored" }] },
    });
    const readiness = moduleValue(d.moduleOutputs, "funding-readiness", "overall");
    const ring = makeVisual({
      ...base,
      id: "dim-iri-ring",
      kind: "progress",
      title: readiness !== null ? "Funding readiness (deterministic)" : "Investor readiness",
      dataState: "partial",
      data: { value: readiness ?? score, max: 100, label: readiness !== null ? `Readiness ${readiness}/100 — IRI ${score}` : `IRI ${score}/100 — stage p50 ${p50}` },
    });
    return { primary, secondary: [ring] };
  }

  if (d.dim === "lco") {
    const completed = moduleField(d.moduleOutputs, "compliance", "completedIds");
    const done = new Set(Array.isArray(completed) ? (completed as string[]) : []);
    const items: Array<[string, string]> = [["ASIC — company registered, director IDs", "acn"], ["ATO — GST / PAYG / R&D registration", "bas"], ["OAIC — privacy policy, breach plan", "privacy_policy"], ["IP — assignment, trademark, domain", "ip_assignment"], ["Shareholders agreement + vesting", "sha"], ["Essential Eight — ML1", "essential_eight"]];
    const docs = cs("documents");
    const status = (id: string): "done" | "pending" | "unknown" => (done.size ? (done.has(id) ? "done" : "pending") : docs === null ? "unknown" : docs >= 70 ? "done" : "pending");
    const primary = makeVisual({
      ...base,
      id: "dim-lco-primary",
      kind: "checklist",
      title: "Compliance checklist",
      subtitle: done.size ? "Item status from the compliance module (self-declared signals); uploads make each row evidenced" : "Item status inferred from the documents criterion score",
      dataState: "partial",
      data: { items: items.map(([label, id]) => ({ label, status: status(id) })) },
      a11y: { tableFallback: items.map(([label, id]) => ({ item: label, status: status(id) })) },
    });
    const risk = makeVisual({ ...base, id: "dim-lco-risk", kind: "heat_map", title: "Legal risk — likelihood × impact", dataState: "benchmark_only", data: { rows: ["Structure", "IP", "Privacy", "Employment"], cols: ["Likelihood", "Impact"], cells: [[100 - score, 60], [100 - score, 70], [100 - score, 50], [100 - score, 40]] } });
    return { primary, secondary: [risk] };
  }

  // svm
  const moat = d.moduleOutputs.find((m) => m.id.includes("fiveFactorMoat"));
  const axes = moat
    ? [["Network effects", "networkEffects"], ["Switching costs", "switchingCosts"], ["Brand", "brand"], ["Proprietary data", "proprietaryData"], ["Economies of scale", "economiesOfScale"]].map(([label, key]) => ({ label, value: typeof moat.output[key] === "number" ? (moat.output[key] as number) : 0, reference: p50 }))
    : [{ label: "SVM", value: score, reference: p50 }, { label: "Roadmap", value: cs("roadmap") ?? score, reference: p50 }, { label: "Idea", value: cs("idea") ?? score, reference: p50 }, { label: "Market", value: cs("market") ?? score, reference: p50 }, { label: "Product", value: cs("code_git") ?? score, reference: p50 }];
  const primary = makeVisual({
    ...base,
    id: "dim-svm-primary",
    kind: "radar",
    title: moat ? "5-factor moat (deterministic from stated signals)" : "Strategic vision & moat — signals vs stage p50",
    dataState: "partial",
    data: { axes, seriesLabel: "This startup", referenceLabel: `stage p50 (${p50})` },
    a11y: { tableFallback: axes.map((a) => ({ axis: a.label, value: a.value, p50 })) },
  });
  const exits = makeVisual({ ...base, id: "dim-svm-exits", kind: "timeline", title: "Exit paths — 3 / 5 / 7 years", dataState: "benchmark_only", data: { items: [{ label: "Strategic", at: 3, detail: "trade sale" }, { label: "PE / secondary", at: 5 }, { label: "ASX / IPO", at: 7 }], unit: "yr", horizon: 8 } });
  return { primary, secondary: [exits] };
}

// ── Entry point ─────────────────────────────────────────────────────────────

/**
 * Chapter visuals: deterministic first; an owner-proposed visual replaces
 * the primary only when its kind is allowed AND every number is traceable.
 * A failed provenance pass keeps the deterministic data and downgrades the
 * state to `partial` (the auditor is invoked by the dispatcher).
 */
export function generateChartsV2(draft: ChapterVisualDraft): ChartsV2Result {
  const det = deterministicVisuals(draft);
  const proposal = draft.proposedPrimary;
  if (!proposal || !proposal.series?.length) return { ...det, provenance: { checked: 0, unresolved: [], downgraded: false } };

  const provenance = checkProvenance(proposal, universeFor(draft));
  if (!isAllowedKind(draft.dim, proposal.kind)) return { ...det, provenance: { ...provenance, downgraded: true } };
  const data = proposalToData(proposal.kind, proposal);
  if (!data) return { ...det, provenance: { ...provenance, downgraded: true } };
  if (provenance.downgraded) {
    return { primary: { ...det.primary, dataState: det.primary.dataState === "real" ? "partial" : det.primary.dataState }, secondary: det.secondary, provenance };
  }
  const evidenceUniverse = evidenceNumbers(draft.evidence);
  const hasEvidenceNumber = proposalNumbers(proposal).some((n) => numberTraceable(n, evidenceUniverse));
  const primary = makeVisual({
    id: `dim-${draft.dim}-primary`,
    kind: proposal.kind,
    dim: draft.dim,
    agentId: draft.ownerAgent,
    title: proposal.title?.trim() || det.primary.title,
    subtitle: "Series values verified against module outputs / evidence rows",
    dataState: clampState(proposal.data_state, hasEvidenceNumber),
    data: data as never,
    a11y: { tableFallback: proposal.series.map((s) => ({ label: s.label, value: typeof s.value === "number" ? s.value : (s.points ?? []).join(" → ") })) },
  });
  return { primary, secondary: det.secondary, provenance };
}
