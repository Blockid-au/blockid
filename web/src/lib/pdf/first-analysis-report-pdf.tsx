/**
 * The first-analysis report — the PDF emailed after a founder's first
 * (free) analysis (S32-B, founder report 2026-09-15).
 *
 * Not a third renderer: every visual primitive (palette, stylesheet, header
 * bar, footer, page title, gauge, metric cards, dimension bars, bullets,
 * action rows, radar and valuation-range SVGs) comes from
 * `svi-report-pdf.tsx`, so this document looks like the family it belongs
 * to. What is new is the STRUCTURE, which is what makes the page-count
 * promise honest:
 *
 *   Free tier — at least ten pages BY CONSTRUCTION:
 *      1  Cover                     (company, date, headline numbers)
 *      2  Contents
 *      3  What we read              (the input echo, with sources)
 *      4  Your Startup Value Index  (gauge, radar, dimension bars)
 *      5  Dimensions I–IV           (rationale, evidence, gaps)
 *      6  Dimensions V–VIII
 *      7  Indicative valuation      (range chart, four-view table, assumptions)
 *      8–14  One page per C-level voice (CEO, CFO, CMO, CTO, CPO, CLO, CHRO)
 *     15  Your first 30 days        (flow diagram + milestones)
 *     16  Glossary
 *     17  Disclaimers
 *   The agent pages may WRAP (a long section spills onto a second physical
 *   page); every other page is `wrap={false}` with hard-sliced lists. So the
 *   file is never shorter than seventeen pages and the colocated suite reads
 *   the count back out of the bytes.
 *
 *   Unlimited (any paid report entitlement) — the same, plus appendices:
 *      A  Evidence gaps and risk penalties, in full
 *      B  Every action, with impact and timeline
 *      C  30 / 60 / 90 milestones with the evidence each one needs
 *
 * Every number on these pages traces to the report object, which traces to
 * an input or a stated assumption (`build.ts`). Nothing is invented here.
 */

import * as React from "react";
import { Document, Page, Text, View, Svg, Rect, Line, Polygon, Text as SvgText } from "@react-pdf/renderer";

import { AdviceDisclaimer, PDF_ENTITY_LINE } from "./advice-disclaimer";
import {
  ActionItem,
  Bullet,
  C,
  DimensionBar,
  Footer,
  HeaderBar,
  InsightBox,
  MetricCard,
  PageTitle,
  RadarChartSVG,
  ScoreGauge,
  ValuationRangeSVG,
  formatAud,
  s,
  sviLabel,
} from "./svi-report-pdf";
import { pdfPageCount } from "./page-count";
import { buildReportMeta } from "@/lib/analyses/first-analysis/meta";
import {
  AGENT_META,
  FIRST_ANALYSIS_AGENTS,
  type AgentSection,
  type FirstAnalysisAgent,
  type FirstAnalysisReport,
} from "@/lib/analyses/first-analysis/types";

export type ReportVariant = "free" | "unlimited";

/** The free tier's floor. Pinned by the colocated suite. */
export const FIRST_ANALYSIS_MIN_PAGES = 10;

/* ─── Slice budgets (what fits an A4 page at these sizes) ────────────────── */
const MAX_ECHO_CLAIMS = 6;
const MAX_ECHO_SLIDES = 12;
const MAX_EVIDENCE_PER_DIM = 3;
const MAX_GAPS_PER_DIM = 2;
const MAX_ASSUMPTIONS = 5;
const MAX_METHOD_ROWS = 4;
const MAX_PLAN_STEPS = 7;
const MAX_MILESTONES = 3;
const MAX_AGENT_BODY_CHARS = 5_200;

function clip(text: string | undefined | null, max: number): string {
  const value = (text ?? "").replace(/\s+/g, " ").trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

/** Paragraphs of an agent body, clipped to the page budget. */
function bodyParagraphs(body: string): string[] {
  const out: string[] = [];
  let used = 0;
  for (const raw of body.split(/\n\s*\n/)) {
    const p = raw.replace(/\s+/g, " ").trim();
    if (!p) continue;
    if (used + p.length > MAX_AGENT_BODY_CHARS) {
      const room = MAX_AGENT_BODY_CHARS - used;
      if (room > 80) out.push(clip(p, room));
      break;
    }
    out.push(p);
    used += p.length;
  }
  return out;
}

/** S32-C — the truthful "Prepared with …" line: the models that actually
 *  wrote the sections (from `report.meta`, or folded from the sections
 *  themselves when a report pre-dates the meta block). */
export function preparedWithLine(report: FirstAnalysisReport): string {
  const meta = report.meta ?? buildReportMeta(report.agents);
  return meta.preparedWith;
}

function longDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return iso;
  }
}

function Eyebrow({ children }: { children: string }) {
  return (
    <Text style={{ fontSize: 7.5, fontFamily: "Helvetica-Bold", letterSpacing: 1.1, textTransform: "uppercase", color: C.ink500, marginBottom: 6 }}>
      {children}
    </Text>
  );
}

function PageMarker({ n, title }: { n: number; title: string }) {
  return (
    <Text style={{ fontSize: 7, color: C.ink400, marginBottom: 12 }}>
      {`First analysis · page ${n} · ${title}`}
    </Text>
  );
}

function Para({ children }: { children: string }) {
  return <Text style={s.body}>{children}</Text>;
}

/* ─── Cover ─────────────────────────────────────────────────────────────── */

function CoverPage({ report, variant }: { report: FirstAnalysisReport; variant: ReportVariant }) {
  const v = report.valuation;
  return (
    <Page size="A4" style={[s.page, { backgroundColor: C.ink900 }]} wrap={false}>
      <View style={{ flex: 1, justifyContent: "space-between" }}>
        <View>
          <Text style={{ fontSize: 8, color: C.brand200, letterSpacing: 2, textTransform: "uppercase" }}>
            BlockID · Startup Value Index
          </Text>
          <Text style={{ fontSize: 30, fontFamily: "Helvetica-Bold", color: C.white, marginTop: 40, lineHeight: 1.15 }}>
            {report.company}
          </Text>
          <Text style={{ fontSize: 14, color: C.brand200, marginTop: 8 }}>
            {variant === "unlimited" ? "First analysis — full report" : "First analysis — free report"}
          </Text>
          <Text style={{ fontSize: 9, color: C.ink400, marginTop: 6 }}>{longDate(report.generatedAt)}</Text>
        </View>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1, backgroundColor: C.ink800, borderRadius: 8, padding: 14 }}>
            <Text style={{ fontSize: 7, color: C.ink400, textTransform: "uppercase", letterSpacing: 1 }}>Startup Value Index</Text>
            <Text style={{ fontSize: 28, fontFamily: "Helvetica-Bold", color: C.emerald400, marginTop: 4 }}>{Math.round(report.svi.total)}</Text>
            <Text style={{ fontSize: 8, color: C.ink300, marginTop: 2 }}>{`${report.svi.stageLabel} · ${sviLabel(report.svi.total)}`}</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: C.ink800, borderRadius: 8, padding: 14 }}>
            <Text style={{ fontSize: 7, color: C.ink400, textTransform: "uppercase", letterSpacing: 1 }}>Indicative valuation</Text>
            <Text style={{ fontSize: 16, fontFamily: "Helvetica-Bold", color: C.white, marginTop: 6 }}>{`${formatAud(v.lowAud)} – ${formatAud(v.highAud)}`}</Text>
            <Text style={{ fontSize: 8, color: C.ink300, marginTop: 2 }}>{v.basis === "revenue" ? "Revenue-anchored" : "SVI-based, no revenue provided"}</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: C.ink800, borderRadius: 8, padding: 14 }}>
            <Text style={{ fontSize: 7, color: C.ink400, textTransform: "uppercase", letterSpacing: 1 }}>Written by</Text>
            <Text style={{ fontSize: 12, fontFamily: "Helvetica-Bold", color: C.white, marginTop: 6 }}>7 C-level voices</Text>
            <Text style={{ fontSize: 8, color: C.ink300, marginTop: 2 }}>CEO · CFO · CMO · CTO · CPO · CLO · CHRO</Text>
          </View>
        </View>

        <View>
          <Text style={{ fontSize: 8, color: C.ink400, lineHeight: 1.5 }}>
            Prepared for the founder from the input they provided. Every number in this document traces to that input or to an assumption stated beside it. The method is grounded in the founder&apos;s doctoral research (DBA) on startup valuation.
          </Text>
          <Text style={{ fontSize: 7, color: C.ink500, marginTop: 6 }}>{preparedWithLine(report)}</Text>
          <Text style={{ fontSize: 7, color: C.ink500, marginTop: 6 }}>{PDF_ENTITY_LINE}</Text>
        </View>
      </View>
    </Page>
  );
}

/* ─── Contents ──────────────────────────────────────────────────────────── */

function ContentsPage({ variant }: { variant: ReportVariant }) {
  const rows: [string, string][] = [
    ["3", "What we read — the facts taken from your input, with sources"],
    ["4", "Your Startup Value Index — the score and the eight dimensions"],
    ["5–6", "Dimension by dimension — rationale, evidence and gaps"],
    ["7", "Indicative valuation — range, four views, assumptions"],
    ["8", "Strategy (CEO)"],
    ["9", "Finances & valuation (CFO)"],
    ["10", "Market & customers (CMO)"],
    ["11", "Product & technology (CTO)"],
    ["12", "Product & validation (CPO)"],
    ["13", "Legal & compliance (CLO)"],
    ["14", "Team & people (CHRO)"],
    ["15", "Your first 30 days — the plan, step by step"],
    ["16", "Glossary"],
    ["17", "Disclaimers"],
  ];
  if (variant === "unlimited") {
    rows.push(["A", "Appendix — evidence gaps and risk penalties in full"]);
    rows.push(["B", "Appendix — every action with impact and timeline"]);
    rows.push(["C", "Appendix — 30 / 60 / 90 milestones"]);
  }
  return (
    <Page size="A4" style={s.page} wrap={false}>
      <HeaderBar />
      <PageTitle title="Contents" subtitle="How to read this report" />
      <PageMarker n={2} title="Contents" />
      <Para>
        Read it in order the first time. The echo on page 3 tells you what BlockID saw; if a row says &quot;not provided&quot;, that is the cheapest score improvement available to you. The seven C-level sections are written for a founder at your stage, from Day 0, and each ends with three concrete next steps.
      </Para>
      <View style={{ marginTop: 10 }}>
        {rows.map(([n, title]) => (
          <View key={`${n}-${title}`} style={{ flexDirection: "row", alignItems: "baseline", borderBottomWidth: 0.5, borderBottomColor: C.surface200, paddingVertical: 5 }}>
            <Text style={{ width: 34, fontSize: 9, fontFamily: "Helvetica-Bold", color: C.brand600 }}>{n}</Text>
            <Text style={{ flex: 1, fontSize: 9, color: C.ink700 }}>{title}</Text>
          </View>
        ))}
      </View>
      {variant === "free" && (
        <View style={{ marginTop: 14, borderWidth: 0.5, borderColor: C.surface200, borderRadius: 8, padding: 10, backgroundColor: C.surface50 }}>
          <Text style={{ fontSize: 8, color: C.ink600, lineHeight: 1.5 }}>
            This is the free first analysis. Paid workspaces receive the unlimited variant: the same report plus appendices with every evidence gap, every action and the 30 / 60 / 90 milestone evidence — and re-runs as the evidence grows.
          </Text>
        </View>
      )}
      <Footer />
    </Page>
  );
}

/* ─── What we read ──────────────────────────────────────────────────────── */

function EchoPage({ report }: { report: FirstAnalysisReport }) {
  const e = report.echo;
  return (
    <Page size="A4" style={s.page} wrap={false}>
      <HeaderBar />
      <PageTitle title="What we read" subtitle={`${e.provided} of ${e.total} facts found · ${e.chars.toLocaleString("en-AU")} characters read${e.truncated ? " (long input — the first 65,000 were scored)" : ""}`} />
      <PageMarker n={3} title="What we read" />
      <View style={{ borderWidth: 0.5, borderColor: C.surface200, borderRadius: 8 }}>
        {e.rows.map((r, i) => (
          <View key={r.key} style={{ flexDirection: "row", paddingVertical: 5, paddingHorizontal: 8, backgroundColor: i % 2 ? C.surface50 : C.white, borderBottomWidth: i === e.rows.length - 1 ? 0 : 0.5, borderBottomColor: C.surface200 }}>
            <Text style={{ width: 70, fontSize: 8, fontFamily: "Helvetica-Bold", color: C.ink700 }}>{r.label}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 8, color: r.value ? C.ink800 : C.amber700, lineHeight: 1.4 }}>
                {r.value ? clip(r.value, 170) : "Not provided"}
              </Text>
              <Text style={{ fontSize: 6.5, color: C.ink400, marginTop: 1 }}>{r.value ? r.source ?? "" : r.hint}</Text>
            </View>
          </View>
        ))}
      </View>

      {e.slideTitles.length > 0 && (
        <View style={{ marginTop: 10 }}>
          <Eyebrow>Deck slides read</Eyebrow>
          <Text style={{ fontSize: 8, color: C.ink600, lineHeight: 1.5 }}>
            {e.slideTitles.slice(0, MAX_ECHO_SLIDES).map((sl) => `${sl.n}. ${clip(sl.title, 40)}`).join("   ")}
          </Text>
        </View>
      )}

      <View style={{ marginTop: 10 }}>
        <Eyebrow>Claims with numbers</Eyebrow>
        {e.claims.length === 0 ? (
          <Text style={{ fontSize: 8, color: C.amber700 }}>No numeric claims were found. A number — users, customers, revenue, a raise — moves the score more than any adjective.</Text>
        ) : (
          e.claims.slice(0, MAX_ECHO_CLAIMS).map((c, i) => <Bullet key={`claim-${i}`} text={`${clip(c.text, 130)} — ${c.source}`} color={C.brand500} />)
        )}
      </View>
      <InsightBox
        label="Why this page exists"
        text="A low reading on any dimension can mean the business is weak there, or that the input did not say. This table separates the two: fix the 'not provided' rows, re-run, and only then read a low score as a business problem."
      />
      <Footer />
    </Page>
  );
}

/* ─── SVI ───────────────────────────────────────────────────────────────── */

function SviPage({ report }: { report: FirstAnalysisReport }) {
  const svi = report.svi;
  const subs = svi.dimensions.map((d) => ({ key: d.key, label: d.label, value: d.score, adjustment: 0, rationale: d.rationale, evidence: d.evidence, gaps: d.gaps }));
  return (
    <Page size="A4" style={s.page} wrap={false}>
      <HeaderBar />
      <PageTitle title="Your Startup Value Index" subtitle="Base 100, open-ended — moves only on evidence" />
      <PageMarker n={4} title="Your Startup Value Index" />
      <View style={{ flexDirection: "row", gap: 16, alignItems: "flex-start" }}>
        <View style={{ alignItems: "center", width: 150 }}>
          <ScoreGauge score={Math.min(100, svi.total)} size={84} />
          <Text style={{ fontSize: 16, fontFamily: "Helvetica-Bold", color: C.ink900, marginTop: 6 }}>{Math.round(svi.total)}</Text>
          <Text style={{ fontSize: 8, color: C.ink500 }}>{`${svi.stageLabel} · ${sviLabel(svi.total)}`}</Text>
          <Text style={{ fontSize: 7, color: C.ink400, marginTop: 4, textAlign: "center" }}>{`Net ${svi.netAdjustment >= 0 ? "+" : ""}${svi.netAdjustment} on base ${svi.baseline} · evidence confidence ${Math.round(svi.confidence * 100)}%`}</Text>
        </View>
        <View style={{ flex: 1, alignItems: "center" }}>
          <RadarChartSVG subs={subs} size={200} />
        </View>
      </View>
      <Para>{clip(svi.summary, 520)}</Para>
      <View style={{ marginTop: 4 }}>
        {svi.dimensions.map((d) => (
          <DimensionBar key={d.key} label={d.label} score={d.score} weight={d.weight} />
        ))}
      </View>
      <Footer />
    </Page>
  );
}

function DimensionsPage({ report, from, to, n }: { report: FirstAnalysisReport; from: number; to: number; n: number }) {
  const dims = report.svi.dimensions.slice(from, to);
  return (
    <Page size="A4" style={s.page} wrap={false}>
      <HeaderBar />
      <PageTitle title={`Dimensions ${from + 1}–${to}`} subtitle="What each score was built on, and what would move it" />
      <PageMarker n={n} title="Dimension by dimension" />
      {dims.map((d) => (
        <View key={d.key} style={{ marginBottom: 10, borderLeftWidth: 3, borderLeftColor: d.score >= 65 ? C.emerald500 : d.score >= 45 ? C.amber500 : C.red500, paddingLeft: 10 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
            <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: C.ink800 }}>{`${d.label} (${d.weight})`}</Text>
            <Text style={{ fontSize: 11, fontFamily: "Helvetica-Bold", color: C.brand600 }}>{`${d.score}/100`}</Text>
          </View>
          <Text style={{ fontSize: 8, color: C.ink600, lineHeight: 1.5, marginTop: 2 }}>{clip(d.rationale, 260)}</Text>
          {d.evidence.slice(0, MAX_EVIDENCE_PER_DIM).map((ev, i) => (
            <Bullet key={`ev-${d.key}-${i}`} text={clip(ev, 120)} />
          ))}
          {d.gaps.slice(0, MAX_GAPS_PER_DIM).map((g, i) => (
            <Bullet key={`gap-${d.key}-${i}`} text={`Gap: ${clip(g, 120)}`} color={C.amber500} />
          ))}
        </View>
      ))}
      <Footer />
    </Page>
  );
}

/* ─── Valuation ─────────────────────────────────────────────────────────── */

function ValuationPage({ report }: { report: FirstAnalysisReport }) {
  const v = report.valuation;
  return (
    <Page size="A4" style={s.page} wrap={false}>
      <HeaderBar />
      <PageTitle title="Indicative valuation" subtitle={v.basis === "revenue" ? "Anchored on the revenue figure in your input" : "SVI-based — no revenue figure was provided"} />
      <PageMarker n={7} title="Indicative valuation" />
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
        <MetricCard label="Low" value={formatAud(v.lowAud)} />
        <MetricCard label="Mid" value={formatAud(v.midAud)} color={C.brand700} />
        <MetricCard label="High" value={formatAud(v.highAud)} />
      </View>
      <ValuationRangeSVG low={v.lowAud} mid={v.midAud} high={v.highAud} />
      <Text style={{ fontSize: 7.5, color: C.ink500, marginTop: 4 }}>{`Method: ${v.method} · confidence ${v.confidence}/100`}</Text>
      <Text style={{ fontSize: 8, color: C.amber700, marginTop: 6, lineHeight: 1.4 }}>{v.note}</Text>

      <Text style={s.h2}>Four views of the same company</Text>
      {v.methods.length === 0 ? (
        <Text style={{ fontSize: 8, color: C.ink500 }}>The cross-check views could not be computed for this input.</Text>
      ) : (
        <View style={{ borderWidth: 0.5, borderColor: C.surface200, borderRadius: 6 }}>
          <View style={{ flexDirection: "row", backgroundColor: C.surface100, paddingVertical: 4, paddingHorizontal: 8 }}>
            <Text style={{ flex: 2, fontSize: 7, fontFamily: "Helvetica-Bold", color: C.ink600 }}>VIEW</Text>
            <Text style={{ flex: 1.2, fontSize: 7, fontFamily: "Helvetica-Bold", color: C.ink600 }}>LOW</Text>
            <Text style={{ flex: 1.2, fontSize: 7, fontFamily: "Helvetica-Bold", color: C.ink600 }}>MID</Text>
            <Text style={{ flex: 1.2, fontSize: 7, fontFamily: "Helvetica-Bold", color: C.ink600 }}>HIGH</Text>
            <Text style={{ flex: 0.8, fontSize: 7, fontFamily: "Helvetica-Bold", color: C.ink600 }}>WEIGHT</Text>
          </View>
          {v.methods.slice(0, MAX_METHOD_ROWS).map((m, i) => (
            <View key={m.name} style={{ paddingVertical: 5, paddingHorizontal: 8, borderTopWidth: 0.5, borderTopColor: C.surface200, backgroundColor: i % 2 ? C.surface50 : C.white }}>
              <View style={{ flexDirection: "row" }}>
                <Text style={{ flex: 2, fontSize: 8, fontFamily: "Helvetica-Bold", color: C.ink800 }}>{m.name}</Text>
                <Text style={{ flex: 1.2, fontSize: 8, color: C.ink700 }}>{formatAud(m.lowAud)}</Text>
                <Text style={{ flex: 1.2, fontSize: 8, color: C.ink700 }}>{formatAud(m.midAud)}</Text>
                <Text style={{ flex: 1.2, fontSize: 8, color: C.ink700 }}>{formatAud(m.highAud)}</Text>
                <Text style={{ flex: 0.8, fontSize: 8, color: C.ink700 }}>{`${Math.round(m.weight * 100)}%`}</Text>
              </View>
              <Text style={{ fontSize: 7, color: C.ink500, marginTop: 2, lineHeight: 1.4 }}>{clip(m.rationale, 180)}</Text>
            </View>
          ))}
        </View>
      )}

      <Text style={s.h2}>Assumptions behind the number</Text>
      {v.assumptions.slice(0, MAX_ASSUMPTIONS).map((a, i) => (
        <Bullet key={`as-${i}`} text={clip(a, 210)} color={C.brand500} />
      ))}
      <Footer />
    </Page>
  );
}

/* ─── Agent pages ───────────────────────────────────────────────────────── */

function AgentPage({ role, section, n, company }: { role: FirstAnalysisAgent; section: AgentSection | undefined; n: number; company: string }) {
  const meta = AGENT_META[role];
  return (
    <Page size="A4" style={s.page}>
      <HeaderBar />
      <PageTitle title={section ? clip(section.title, 110) : `${meta.label} (${meta.role})`} subtitle={`${meta.role} · ${meta.label} — ${meta.lens}`} />
      <PageMarker n={n} title={`${meta.label} (${meta.role})`} />
      {section ? (
        <>
          {bodyParagraphs(section.body).map((p, i) => (
            <Text key={`p-${i}`} style={s.body}>{p}</Text>
          ))}
          <Text style={s.h2}>Next steps</Text>
          {section.nextSteps.map((step, i) => (
            <ActionItem key={`ns-${i}`} num={i + 1} text={clip(step, 260)} />
          ))}
        </>
      ) : (
        <View style={{ marginTop: 10, borderWidth: 0.5, borderColor: C.surface200, borderRadius: 8, padding: 12, backgroundColor: C.surface50 }}>
          <Text style={{ fontSize: 9, color: C.ink700, lineHeight: 1.5 }}>
            {`The ${meta.role} section for ${company} could not be written in this run. It is retried automatically; open the analysis on screen for the latest version, or press "Resend report" once it lands.`}
          </Text>
        </View>
      )}
      <Footer />
    </Page>
  );
}

/* ─── 30-day plan with a flow diagram ───────────────────────────────────── */

function PlanFlowSVG({ steps, width = 490 }: { steps: { day: number; title: string }[]; width?: number }) {
  const n = Math.max(steps.length, 2);
  const boxW = Math.min(88, (width - 12 * (n - 1)) / n);
  const gap = (width - boxW * n) / Math.max(1, n - 1);
  const boxH = 46;
  const height = boxH + 26;
  return (
    <Svg width={width} height={height}>
      {steps.map((st, i) => {
        const x = i * (boxW + gap);
        const y = 14;
        const first = i === 0;
        const last = i === steps.length - 1;
        return (
          <React.Fragment key={`step-${i}`}>
            <Rect x={x} y={y} width={boxW} height={boxH} rx={6} fill={first ? C.brand700 : last ? C.emerald600 : C.brand50} stroke={C.brand600} strokeWidth={0.8} />
            <SvgText x={x + boxW / 2} y={y + 13} fill={first || last ? C.white : C.brand700} style={{ fontSize: 7, fontFamily: "Helvetica-Bold" }} textAnchor="middle">
              {`Day ${st.day}`}
            </SvgText>
            <SvgText x={x + boxW / 2} y={y + 25} fill={first || last ? C.white : C.ink700} style={{ fontSize: 5.6 }} textAnchor="middle">
              {clip(st.title, 24)}
            </SvgText>
            <SvgText x={x + boxW / 2} y={y + 34} fill={first || last ? C.brand100 : C.ink500} style={{ fontSize: 5.6 }} textAnchor="middle">
              {clip(st.title.slice(24), 24)}
            </SvgText>
            {i < steps.length - 1 && (
              <>
                <Line x1={x + boxW} y1={y + boxH / 2} x2={x + boxW + gap - 4} y2={y + boxH / 2} stroke={C.ink400} strokeWidth={1} />
                <Polygon points={`${x + boxW + gap - 4},${y + boxH / 2 - 3} ${x + boxW + gap},${y + boxH / 2} ${x + boxW + gap - 4},${y + boxH / 2 + 3}`} fill={C.ink400} />
              </>
            )}
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

function PlanPage({ report }: { report: FirstAnalysisReport }) {
  const plan = report.actionPlan;
  const steps = plan.steps.slice(0, MAX_PLAN_STEPS);
  return (
    <Page size="A4" style={s.page} wrap={false}>
      <HeaderBar />
      <PageTitle title="Your first 30 days" subtitle="Step by step from Day 0 — the evidence you build is what moves the index" />
      <PageMarker n={15} title="Your first 30 days" />
      <PlanFlowSVG steps={steps} />
      <View style={{ marginTop: 8 }}>
        {steps.map((st, i) => (
          <View key={`ps-${i}`} style={{ flexDirection: "row", marginBottom: 6 }}>
            <Text style={{ width: 40, fontSize: 8, fontFamily: "Helvetica-Bold", color: C.brand600 }}>{`Day ${st.day}`}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 8.5, fontFamily: "Helvetica-Bold", color: C.ink800 }}>{clip(st.title, 90)}</Text>
              <Text style={{ fontSize: 7.5, color: C.ink600, lineHeight: 1.45 }}>{clip(st.detail, 210)}</Text>
            </View>
          </View>
        ))}
      </View>
      {plan.milestones.length > 0 && (
        <>
          <Text style={s.h2}>Checkpoints</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {plan.milestones.slice(0, MAX_MILESTONES).map((m) => (
              <View key={`m-${m.day}`} style={{ flex: 1, borderWidth: 0.5, borderColor: C.surface200, borderRadius: 6, padding: 8, backgroundColor: C.surface50 }}>
                <Text style={{ fontSize: 7, color: C.brand600, fontFamily: "Helvetica-Bold" }}>{`DAY ${m.day}`}</Text>
                <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: C.ink800, marginTop: 2 }}>{clip(m.title, 50)}</Text>
                <Text style={{ fontSize: 7, color: C.ink600, marginTop: 2, lineHeight: 1.4 }}>{clip(m.goal, 110)}</Text>
              </View>
            ))}
          </View>
        </>
      )}
      <Footer />
    </Page>
  );
}

/* ─── Glossary & disclaimers ────────────────────────────────────────────── */

const GLOSSARY: [string, string][] = [
  ["Startup Value Index (SVI)", "BlockID's open-ended index. Base 100; each of eight dimensions adds or subtracts on evidence. It is a position, not a valuation."],
  ["Dimension", "One of eight lenses: Founder & Team, Market & Problem, Product & Tech, Traction & Revenue, Cap Table & Governance, Investor Readiness, Legal & Compliance, Strategic Vision & Moat."],
  ["Evidence confidence", "How much of the eight dimensions your input actually evidences. Low confidence means 'tell us more', not 'you are weak'."],
  ["Indicative valuation", "A range built from stated methods and assumptions. Not a formal valuation and not advice."],
  ["Berkus method", "Pre-revenue method that assigns a capped dollar value to five pillars: idea, prototype, team, relationships, rollout."],
  ["Scorecard method", "Weights the company against the regional pre-money median for its stage."],
  ["Revenue multiple", "Valuation as a multiple of annual recurring revenue, by sector. Used only when a revenue figure was provided."],
  ["MRR / ARR", "Monthly / annual recurring revenue. A figure here changes the valuation method."],
  ["ESIC", "Early Stage Innovation Company — an ATO status that gives eligible investors a tax offset."],
  ["R&D Tax Incentive", "The Australian programme refunding a share of eligible research and development spend (43.5% refundable offset for companies under A$20M turnover)."],
  ["ESOP", "Employee share option plan; Australian start-up tax concession applies when the conditions are met."],
  ["Evidence gap", "A fact the score could not find. Closing it is the cheapest way to move the index."],
];

function GlossaryPage() {
  return (
    <Page size="A4" style={s.page} wrap={false}>
      <HeaderBar />
      <PageTitle title="Glossary" subtitle="The terms used in this report, in plain words" />
      <PageMarker n={16} title="Glossary" />
      {GLOSSARY.map(([term, def]) => (
        <View key={term} style={{ flexDirection: "row", marginBottom: 7 }}>
          <Text style={{ width: 130, fontSize: 8.5, fontFamily: "Helvetica-Bold", color: C.ink800 }}>{term}</Text>
          <Text style={{ flex: 1, fontSize: 8, color: C.ink600, lineHeight: 1.5 }}>{def}</Text>
        </View>
      ))}
      <Footer />
    </Page>
  );
}

function DisclaimerPage({ report }: { report: FirstAnalysisReport }) {
  return (
    <Page size="A4" style={s.page} wrap={false}>
      <HeaderBar />
      <PageTitle title="Disclaimers" subtitle="What this document is, and is not" />
      <PageMarker n={17} title="Disclaimers" />
      <Para>
        This report was generated by BlockID.au from the information the founder provided. The &quot;What we read&quot; page lists exactly what that information was. Where a fact was not provided, the report says so; it does not fill the gap with an estimate presented as the founder&apos;s number.
      </Para>
      <Para>
        The Startup Value Index is a directional measure of evidence, not a financial valuation. The indicative valuation range is produced by the methods and assumptions listed on page 7 and is provided for the founder&apos;s own planning. It is not an offer, a recommendation, or a statement that any investor would transact at these values.
      </Para>
      <Para>
        The C-level sections are written by BlockID&apos;s AI agents, each grounded on the same input. They are commentary for a founder, in a mentoring register, and may be wrong where the input was thin. Read them as a senior advisor&apos;s first pass, not as a decision.
      </Para>
      <Para>
        {`Data: the founder owns the input. BlockID stores it only to process this analysis and to give its agents the best context for this case. Reference: ${report.analysisId.slice(0, 8)} · generated ${longDate(report.generatedAt)}.`}
      </Para>
      <AdviceDisclaimer variant="financial" />
      <Footer />
    </Page>
  );
}

/* ─── Appendices (unlimited variant) ────────────────────────────────────── */

function AppendixGapsPage({ report }: { report: FirstAnalysisReport }) {
  return (
    <Page size="A4" style={s.page}>
      <HeaderBar />
      <PageTitle title="Appendix A — Evidence gaps and risk penalties" subtitle="Every gap the score found, worst first, with the points each one is worth" />
      {report.svi.evidenceGaps.map((g, i) => (
        <ActionItem key={`g-${i}`} num={i + 1} text={`[${g.priority}] ${g.label} (+${g.impact} pts)`} detail={g.action} />
      ))}
      {report.svi.riskPenalties.length > 0 && (
        <>
          <Text style={s.h2}>Risk penalties applied</Text>
          {report.svi.riskPenalties.map((r, i) => (
            <Bullet key={`r-${i}`} text={`${r.label} (${r.points} pts): ${r.reason}`} color={C.red500} />
          ))}
        </>
      )}
      <Footer />
    </Page>
  );
}

function AppendixActionsPage({ report }: { report: FirstAnalysisReport }) {
  return (
    <Page size="A4" style={s.page}>
      <HeaderBar />
      <PageTitle title="Appendix B — Every action" subtitle="Impact and timeline for each recommended move" />
      {report.actionPlan.actions.map((a, i) => (
        <ActionItem key={`a-${i}`} num={i + 1} text={`[${a.priority} · ${a.timeline.replace("_", " ")}] ${a.title}`} detail={`${a.detail} Impact: ${a.impact}.`} />
      ))}
      <Footer />
    </Page>
  );
}

function AppendixMilestonesPage({ report }: { report: FirstAnalysisReport }) {
  return (
    <Page size="A4" style={s.page}>
      <HeaderBar />
      <PageTitle title="Appendix C — 30 / 60 / 90 milestones" subtitle="The evidence each checkpoint needs" />
      {report.actionPlan.milestones.map((m) => (
        <View key={`ms-${m.day}`} style={{ marginBottom: 12 }}>
          <Text style={s.h3}>{`Day ${m.day} — ${m.title}`}</Text>
          <Text style={s.body}>{m.goal}</Text>
          {m.evidence.map((ev, i) => (
            <Bullet key={`ev-${m.day}-${i}`} text={ev} />
          ))}
        </View>
      ))}
      <Footer />
    </Page>
  );
}

/* ─── Document ──────────────────────────────────────────────────────────── */

export interface FirstAnalysisReportPDFProps {
  report: FirstAnalysisReport;
  variant?: ReportVariant;
}

export function FirstAnalysisReportPDF({ report, variant = "free" }: FirstAnalysisReportPDFProps) {
  return (
    <Document title={`${report.company} — first analysis`} author="BlockID.au" subject="Startup Value Index first analysis">
      <CoverPage report={report} variant={variant} />
      <ContentsPage variant={variant} />
      <EchoPage report={report} />
      <SviPage report={report} />
      <DimensionsPage report={report} from={0} to={4} n={5} />
      <DimensionsPage report={report} from={4} to={8} n={6} />
      <ValuationPage report={report} />
      {FIRST_ANALYSIS_AGENTS.map((role, i) => (
        <AgentPage key={role} role={role} section={report.agents[role]} n={8 + i} company={report.company} />
      ))}
      <PlanPage report={report} />
      <GlossaryPage />
      <DisclaimerPage report={report} />
      {variant === "unlimited" && (
        <>
          <AppendixGapsPage report={report} />
          <AppendixActionsPage report={report} />
          <AppendixMilestonesPage report={report} />
        </>
      )}
    </Document>
  );
}

/** Render to bytes and read the page count back out of them. */
export async function renderFirstAnalysisReportPdf(props: FirstAnalysisReportPDFProps): Promise<{ buffer: Buffer; pages: number }> {
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const buffer = await renderToBuffer(<FirstAnalysisReportPDF {...props} />);
  return { buffer: Buffer.from(buffer), pages: pdfPageCount(buffer) };
}
