// quarterly-report — the sponsor / LP quarterly report a Program user exports
// for a cohort (T0272, G12 sprint S5). Pure: builds the data shape and
// renders a self-contained, print-ready HTML document (A4 @page rules, so
// "Save as PDF" from the browser is the PDF path — the same approach as the
// /tbr/<token>?pdf=1 page the Playwright exporter drives).
//
// Sections (plan §3c-7): cover · cohort summary (n, median SVI, movers) ·
// per-startup one-liners · methodology footnote (the approved doctoral
// sentence — "grounded in the founder's doctoral research (DBA) on startup
// valuation", never "PhD") · evaluator disclaimer (DISCLAIMER_SURFACES.
// evaluator_report, byte-identical to EvaluatorReportDisclaimer) · entity
// line. The entity line is the BILLING / LEGAL entity — Auschain PTY LTD —
// not the marketing "PPL Food PTY LTD"; the two are deliberately different.
//
// Served by GET /api/reports/quarterly?batch=<id> (evaluation batches) and
// ?cohort=<id> (accelerator cohort_members — the link the existing
// /workspace/accelerator/quarterly-report page has carried since Wave 25).

import { DISCLAIMER_SURFACES } from "@/lib/legal/surfaces";
import {
  DIMENSION_KEYS,
  DIMENSION_LABELS,
  isEqualWeights,
  median,
  stageName,
  type CohortRow,
  type RubricWeights,
} from "./batch-shared";

export const DOCTORAL_SENTENCE =
  "The Startup Value Index scores every startup on 8 dimensions × 13 criteria across 12 growth phases, reviewed by 11 C-Level agents with an auditor behind them, and is grounded in the founder's doctoral research (DBA) on startup valuation.";

export const LEGAL_ENTITY_LINE = "Auschain PTY LTD (ACN 659 615 111, ABN 79 659 615 111)";

export function evaluatorDisclaimerText(): string {
  return DISCLAIMER_SURFACES.evaluator_report.body_md.replace(/\*\*/g, "");
}

export interface QuarterlyReportStartup {
  name: string;
  svi: number | null;
  weighted: number | null;
  stage: number | null;
  delta: number | null;
  topStrength: string | null;
  topGap: string | null;
  reportUrl: string | null;
  status: "done" | "failed" | "queued" | "running";
}

export interface QuarterlyReportData {
  /** "Cohort 4 intake" — the batch / cohort name. */
  cohortName: string;
  /** Who is exporting (program / fund display name) — optional. */
  programName: string | null;
  /** "Q3 2026" */
  quarterLabel: string;
  generatedAt: string;
  source: "batch" | "cohort";
  weights: RubricWeights | null;
  startups: QuarterlyReportStartup[];
}

export interface QuarterlySummary {
  n: number;
  scored: number;
  medianSvi: number | null;
  medianWeighted: number | null;
  moversUp: QuarterlyReportStartup[];
  moversDown: QuarterlyReportStartup[];
  stageMix: Array<{ stage: string; count: number }>;
}

export function quarterLabelFor(d: Date): string {
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `Q${q} ${d.getUTCFullYear()}`;
}

export function summariseQuarterly(startups: QuarterlyReportStartup[]): QuarterlySummary {
  const scored = startups.filter((s) => s.svi != null);
  const withDelta = scored.filter((s) => s.delta != null && s.delta !== 0);
  const moversUp = [...withDelta].filter((s) => (s.delta as number) > 0).sort((a, b) => (b.delta as number) - (a.delta as number)).slice(0, 5);
  const moversDown = [...withDelta].filter((s) => (s.delta as number) < 0).sort((a, b) => (a.delta as number) - (b.delta as number)).slice(0, 5);
  const mix = new Map<string, number>();
  for (const s of scored) mix.set(stageName(s.stage), (mix.get(stageName(s.stage)) ?? 0) + 1);
  return {
    n: startups.length,
    scored: scored.length,
    medianSvi: median(scored.map((s) => s.svi as number)),
    medianWeighted: median(scored.map((s) => s.weighted).filter((v): v is number => v != null)),
    moversUp,
    moversDown,
    stageMix: Array.from(mix.entries()).map(([stage, count]) => ({ stage, count })).sort((a, b) => b.count - a.count),
  };
}

export function cohortRowsToReportStartups(rows: CohortRow[]): QuarterlyReportStartup[] {
  return rows.map((r) => ({
    name: r.startup,
    svi: r.svi,
    weighted: r.weighted,
    stage: r.stage,
    delta: r.delta,
    topStrength: r.topStrength,
    topGap: r.topGap,
    reportUrl: r.reportUrl,
    status: r.status,
  }));
}

export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtDelta(d: number | null): string {
  if (d == null) return "new";
  if (d === 0) return "±0";
  return `${d > 0 ? "▲" : "▼"} ${Math.abs(d)}`;
}

function oneLiner(s: QuarterlyReportStartup): string {
  if (s.svi == null) {
    return s.status === "failed" ? "scoring failed — re-run from the cohort table" : "not scored yet";
  }
  const parts = [`SVI ${Math.round(s.svi)}`];
  if (s.weighted != null && s.weighted !== s.svi) parts.push(`weighted ${s.weighted}`);
  parts.push(stageName(s.stage));
  parts.push(fmtDelta(s.delta));
  const tail: string[] = [];
  if (s.topStrength) tail.push(`strongest on ${s.topStrength}`);
  if (s.topGap) tail.push(`biggest gap ${s.topGap}`);
  return `${parts.join(" · ")}${tail.length ? ` — ${tail.join(", ")}` : ""}`;
}

export function renderQuarterlyReportHtml(
  data: QuarterlyReportData,
  base = "https://blockid.au",
  /** CSP nonce from the `x-nonce` request header — inline handlers are blocked by proxy.ts. */
  nonce: string | null = null,
): string {
  const sum = summariseQuarterly(data.startups);
  const title = `${data.cohortName} — Sponsor / LP report ${data.quarterLabel}`;
  const weightsNote =
    data.weights && !isEqualWeights(data.weights)
      ? `Weighted score uses this program's rubric weights: ${DIMENSION_KEYS.map((k) => `${DIMENSION_LABELS[k]} ${data.weights?.[k]}%`).join(", ")}. The SVI itself is unweighted so cohorts stay comparable.`
      : "Weighted score uses equal weights across the 8 dimensions (the default rubric).";
  const generated = new Date(data.generatedAt);
  const generatedLabel = Number.isNaN(generated.getTime())
    ? data.generatedAt
    : generated.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });

  const startupRows = data.startups
    .map(
      (s) =>
        `<li><strong>${esc(s.name)}</strong> — ${esc(oneLiner(s))}${
          s.reportUrl ? ` <a href="${esc(base + s.reportUrl)}">report</a>` : ""
        }</li>`,
    )
    .join("\n");

  const movers = (list: QuarterlyReportStartup[], empty: string) =>
    list.length === 0
      ? `<p class="muted">${esc(empty)}</p>`
      : `<ul>${list.map((s) => `<li>${esc(s.name)} ${esc(fmtDelta(s.delta))} → SVI ${Math.round(s.svi as number)}</li>`).join("")}</ul>`;

  return `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font: 11pt/1.5 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111827; margin: 0; padding: 24px; background: #fff; max-width: 820px; margin-inline: auto; }
  h1 { font-size: 24pt; line-height: 1.2; margin: 0 0 8px; }
  h2 { font-size: 14pt; margin: 28px 0 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
  .cover { padding: 48px 0 32px; border-bottom: 2px solid #111827; page-break-after: always; }
  .eyebrow { text-transform: uppercase; letter-spacing: .08em; font-size: 9pt; color: #6b7280; }
  .muted { color: #6b7280; }
  .tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 12px 0; }
  .tile { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 12px; }
  .tile .v { font-size: 20pt; font-weight: 700; }
  .tile .l { font-size: 9pt; color: #6b7280; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  ul { padding-left: 18px; } li { margin: 4px 0; }
  .foot { margin-top: 32px; font-size: 8.5pt; color: #4b5563; border-top: 1px solid #e5e7eb; padding-top: 12px; }
  .print { position: fixed; top: 12px; right: 12px; }
  @media print { .print { display: none; } body { padding: 0; } }
</style>
</head>
<body>
<button class="print" type="button" id="print-btn">Save as PDF</button>
${nonce ? `<script nonce="${esc(nonce)}">document.getElementById("print-btn").addEventListener("click",function(){window.print()});</script>` : ""}
<header class="cover">
  <div class="eyebrow">Sponsor / LP report · ${esc(data.quarterLabel)}</div>
  <h1>${esc(data.cohortName)}</h1>
  ${data.programName ? `<p>Prepared by ${esc(data.programName)}</p>` : ""}
  <p class="muted">Generated ${esc(generatedLabel)} · ${sum.n} startup${sum.n === 1 ? "" : "s"} · ${sum.scored} scored on one rubric</p>
</header>

<section aria-label="Cohort summary">
  <h2>Cohort summary</h2>
  <div class="tiles">
    <div class="tile"><div class="v">${sum.n}</div><div class="l">Startups in cohort</div></div>
    <div class="tile"><div class="v">${sum.scored}</div><div class="l">Scored this run</div></div>
    <div class="tile"><div class="v">${sum.medianSvi == null ? "—" : esc(sum.medianSvi)}</div><div class="l">Median SVI</div></div>
    <div class="tile"><div class="v">${sum.medianWeighted == null ? "—" : esc(sum.medianWeighted)}</div><div class="l">Median weighted score</div></div>
  </div>
  <div class="cols">
    <div><h3>Moved up</h3>${movers(sum.moversUp, "No startup improved its SVI since its previous score.")}</div>
    <div><h3>Moved down</h3>${movers(sum.moversDown, "No startup lost SVI since its previous score.")}</div>
  </div>
  ${sum.stageMix.length ? `<p class="muted">Stage mix: ${sum.stageMix.map((m) => `${esc(m.stage)} ${m.count}`).join(" · ")}</p>` : ""}
</section>

<section aria-label="Startups">
  <h2>Startups</h2>
  <ul>
${startupRows}
  </ul>
</section>

<section aria-label="Methodology" class="foot">
  <p><strong>Methodology.</strong> ${esc(DOCTORAL_SENTENCE)} ${esc(weightsNote)} "Δ" compares each startup's SVI with its previous score on the platform; "new" means this was its first.</p>
  <p data-surface="evaluator_report">${esc(evaluatorDisclaimerText())}</p>
  <p>Produced by BlockID.au · ${esc(LEGAL_ENTITY_LINE)} · Sydney NSW · <a href="${esc(base)}/legal/disclaimers">Full disclaimers</a></p>
</section>
</body>
</html>
`;
}
