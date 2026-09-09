/**
 * The free tier's artefact — a genuine five-page summary.
 *
 * NOT A THIRD RENDERER. Every visual element here is imported from
 * `svi-report-pdf.tsx`: the palette, the stylesheet, the header bar and
 * footer, the page title rule, the score gauge, the metric cards, the
 * dimension bars, the bullets and action rows, and the three SVG charts
 * (radar, valuation range, percentile band). The free summary is a shorter
 * cut of the same document, and it looks like one because it is drawn with
 * the same pieces.
 *
 * WHAT MAKES THE PAGE COUNT HONEST
 *
 * `FREE_SUMMARY_PAGES` in `@/lib/analyses/free-summary` is the single
 * definition of what "five pages" means — the homepage, the offer card, the
 * email and this file all read it. Two mechanics keep the file matching the
 * promise:
 *
 *   1. Every `<Page>` here is `wrap={false}`. @react-pdf's default is to spill
 *      overlong content onto an extra physical page, which would quietly turn
 *      a five-page promise into a six-page file. With wrapping off the page
 *      count is fixed by construction.
 *   2. Because clipping is the price of (1), every list on every page is hard
 *      sliced to a count that fits an A4 page at these type sizes, and the
 *      colocated suite renders extreme inputs (an eight-dimension analysis
 *      with the maximum gaps and the longest rationales we generate) and reads
 *      the page count back out of the produced bytes.
 *
 * WHAT IS DELIBERATELY NOT HERE
 *
 * The four-method valuation working, the per-dimension rationale pages, the
 * cohort comparison set, the accelerator checklist, the risk landscape and the
 * 90-day roadmap. Those are the A$3 report. Page five names them in plain
 * words instead of teasing them — the free artefact is smaller, not broken,
 * and a reader who never pays should still be glad they read it.
 */

import { Document, Page, Text, View } from "@react-pdf/renderer";

import type { SVIAnalysis } from "@/lib/svi-analysis";
import { SVI_BENCHMARKS } from "@/lib/svi-analysis";
import { getSVIBenchmark } from "@/lib/benchmarks";
import { estimateValuation } from "@/lib/valuation";
import {
  FREE_SUMMARY_PAGES,
  PAID_REPORT_ADDITIONS,
} from "@/lib/analyses/free-summary";
import {
  ActionItem,
  Bullet,
  C,
  DIM_LABELS,
  DimensionBar,
  Footer,
  HeaderBar,
  InsightBox,
  MetricCard,
  PageTitle,
  PercentileBandSVG,
  RadarChartSVG,
  ScoreGauge,
  ValuationRangeSVG,
  barColor,
  formatAud,
  s,
  sviLabel,
} from "./svi-report-pdf";

/* ─── Slice budgets ────────────────────────────────────────────────────────
 * Each number is what fits an A4 page at these type sizes with room to spare.
 * They exist so `wrap={false}` never has anything to clip. Changing one means
 * re-running the colocated page-count suite. */
const MAX_DIMENSIONS = 8; // the model only ever produces eight
const MAX_STRENGTHS = 4;
const MAX_WEAKNESSES = 4;
const MAX_GAPS = 6;
const MAX_ACTIONS = 4;
const MAX_EVIDENCE_CHARS = 150;
const MAX_RATIONALE_CHARS = 170;

function clip(text: string | undefined | null, max: number): string {
  const value = (text ?? "").replace(/\s+/g, " ").trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

export interface SVISummaryPDFProps {
  analysis: SVIAnalysis;
  /** Shown on every page header. Falls back to a neutral label. */
  startupName?: string;
  /** en-AU long date. Defaults to today. */
  reportDate?: string;
}

/** Small caps eyebrow above a block. */
function Eyebrow({ children }: { children: string }) {
  return (
    <Text
      style={{
        fontSize: 7.5,
        fontFamily: "Helvetica-Bold",
        letterSpacing: 1.1,
        textTransform: "uppercase",
        color: C.ink500,
        marginBottom: 6,
      }}
    >
      {children}
    </Text>
  );
}

/** The line that runs under every page title: "Page N of 5 · <page title>". */
function PageMarker({ index }: { index: number }) {
  const page = FREE_SUMMARY_PAGES[index];
  return (
    <Text
      style={{
        fontSize: 7,
        color: C.ink400,
        marginBottom: 8,
        letterSpacing: 0.6,
      }}
    >
      {`Free summary · page ${index + 1} of ${FREE_SUMMARY_PAGES.length} · ${page.title}`}
    </Text>
  );
}

/** A strength / weakness row: the reading, then the evidence behind it. */
function ReadingRow({
  label,
  score,
  line,
  color,
}: {
  label: string;
  score: number;
  line: string;
  color: string;
}) {
  return (
    <View
      style={{
        marginBottom: 9,
        paddingLeft: 9,
        borderLeftWidth: 2,
        borderLeftColor: color,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <Text
          style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: C.ink800 }}
        >
          {label}
        </Text>
        <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color }}>
          {Math.round(score)}/100
        </Text>
      </View>
      <Text
        style={{ fontSize: 8, color: C.ink600, lineHeight: 1.5, marginTop: 2 }}
      >
        {line}
      </Text>
    </View>
  );
}

export function SVISummaryPDF({
  analysis,
  startupName,
  reportDate,
}: SVISummaryPDFProps) {
  const name = startupName?.trim() || "Your startup";
  const date =
    reportDate ||
    new Date().toLocaleDateString("en-AU", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

  const svi = analysis.totalSVI;
  const dims =
    analysis.dimensionScores ??
    Object.fromEntries((analysis.subs ?? []).map((sub) => [sub.key, sub.value]));
  const valuation = estimateValuation(
    svi,
    analysis.stage,
    { sector: analysis.sector ?? analysis.signals?.sector },
    dims,
  );
  const percentile = analysis.percentileRank ?? 50;
  const benchmark = SVI_BENCHMARKS[analysis.stage] ?? SVI_BENCHMARKS[0];
  const confidence = Math.round(analysis.confidenceMultiplier * 100);
  // Per-dimension Australian cohort average at this stage. The `weight`
  // slot on DimensionBar is a small parenthetical beside the label; the
  // paid report puts a scoring weight there, which is internal machinery.
  // The useful thing to a founder is what the same dimension averages at
  // their stage in this market, so that is what goes there.
  const cohort = getSVIBenchmark(analysis.stage);

  const subs = (analysis.subs ?? []).slice(0, MAX_DIMENSIONS);
  const ranked = [...subs].sort((a, b) => b.value - a.value);
  const strengths = ranked.slice(0, MAX_STRENGTHS);
  const weaknesses = [...ranked].reverse().slice(0, MAX_WEAKNESSES);

  const gaps = [...(analysis.evidenceGaps ?? [])]
    .sort((a, b) => {
      const order = { P0: 0, P1: 1, P2: 2 } as const;
      const byPriority = order[a.priority] - order[b.priority];
      return byPriority !== 0 ? byPriority : b.impact - a.impact;
    })
    .slice(0, MAX_GAPS);
  const gapUpside = gaps.reduce((sum, gap) => sum + (gap.impact || 0), 0);

  // `nextActions` is only populated on some runs. The paid renderer falls
  // back to the evidence gaps for exactly this reason; page five is the
  // "what do I do" page and must never come back empty when the analysis
  // plainly knows what is missing.
  const actions = (
    analysis.nextActions && analysis.nextActions.length > 0
      ? analysis.nextActions
      : gaps.map((gap) => ({
          priority: gap.priority,
          title: gap.label,
          detail: gap.action,
          impact: `+${gap.impact} index points`,
        }))
  ).slice(0, MAX_ACTIONS);

  const footer = <Footer />;

  return (
    <Document
      title={`${name} — free ${FREE_SUMMARY_PAGES.length}-page summary`}
      author="BlockID.au (Auschain Pty Ltd)"
      subject="Startup Value Index summary"
    >
      {/* ── PAGE 1 — Your number ──────────────────────────────────────── */}
      <Page size="A4" style={s.page} wrap={false}>
        <HeaderBar />
        <PageMarker index={0} />
        <PageTitle
          title={FREE_SUMMARY_PAGES[0].title}
          subtitle={`${name} · ${analysis.stageLabel} · ${date}`}
        />

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 18,
            marginBottom: 16,
          }}
        >
          <ScoreGauge score={svi} size={84} />
          <View style={{ flex: 1 }}>
            <Eyebrow>Startup Value Index</Eyebrow>
            <Text
              style={{
                fontSize: 17,
                fontFamily: "Helvetica-Bold",
                color: C.ink900,
              }}
            >
              {sviLabel(svi)}
            </Text>
            <Text
              style={{
                fontSize: 8.5,
                color: C.ink600,
                lineHeight: 1.55,
                marginTop: 4,
              }}
            >
              {`The median company at ${analysis.stageLabel.toLowerCase()} stage in this market scores ${benchmark.p50}. The top quartile starts at ${benchmark.p75}.`}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
          <MetricCard label="Stage" value={analysis.stageLabel} />
          <MetricCard
            label="Evidence confidence"
            value={`${confidence}%`}
            sub="How much of the score rests on stated facts"
          />
          <MetricCard
            label="Percentile"
            value={`${Math.round(percentile)}th`}
            sub="Against Australian companies at your stage"
          />
        </View>

        <Eyebrow>Where you sit</Eyebrow>
        <PercentileBandSVG percentile={percentile} width={500} height={34} />

        <View style={{ height: 12 }} />

        <Eyebrow>Indicative valuation range</Eyebrow>
        <ValuationRangeSVG
          low={valuation.low}
          mid={valuation.mid}
          high={valuation.high}
          width={500}
          height={30}
        />
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            marginTop: 2,
            marginBottom: 10,
          }}
        >
          <Text style={{ fontSize: 8.5, color: C.ink600 }}>
            {`Low ${formatAud(valuation.low)}`}
          </Text>
          <Text
            style={{
              fontSize: 11,
              fontFamily: "Helvetica-Bold",
              color: C.brand700,
            }}
          >
            {formatAud(valuation.mid)}
          </Text>
          <Text style={{ fontSize: 8.5, color: C.ink600 }}>
            {`High ${formatAud(valuation.high)}`}
          </Text>
        </View>

        <InsightBox
          label="READ THIS AS A RANGE"
          text={clip(analysis.summary, 320)}
        />

        <Text
          style={{
            fontSize: 7.5,
            color: C.ink500,
            lineHeight: 1.5,
            marginTop: 10,
          }}
        >
          Indicative only. This is a directional estimate for a conversation,
          not a formal valuation, and BlockID.au does not hold an AFSL. Seek
          independent professional advice before acting on it.
        </Text>

        {footer}
      </Page>

      {/* ── PAGE 2 — The eight dimensions ─────────────────────────────── */}
      <Page size="A4" style={s.page} wrap={false}>
        <HeaderBar />
        <PageMarker index={1} />
        <PageTitle
          title={FREE_SUMMARY_PAGES[1].title}
          subtitle="Every reading behind the score, and what it is measured against"
        />

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
            marginBottom: 12,
          }}
        >
          <RadarChartSVG subs={subs} size={190} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 8.5, color: C.ink600, lineHeight: 1.6 }}>
              The score is not one opinion. It is eight readings, each built
              from the evidence in what you gave us, and each placed against
              what companies at the same stage in this market actually score.
              A weak dimension is a specific thing to go and fix.
            </Text>
            <View style={{ height: 8 }} />
            <Text style={{ fontSize: 8.5, color: C.ink600, lineHeight: 1.6 }}>
              {`Strongest: ${strengths[0] ? DIM_LABELS[strengths[0].key] ?? strengths[0].label : "—"}. Weakest: ${weaknesses[0] ? DIM_LABELS[weaknesses[0].key] ?? weaknesses[0].label : "—"}.`}
            </Text>
          </View>
        </View>

        {subs.map((sub) => (
          <DimensionBar
            key={sub.key}
            label={DIM_LABELS[sub.key] ?? sub.label}
            score={sub.value}
            weight={`AU average ${cohort.dimensions[sub.key]?.avg ?? "—"}`}
          />
        ))}

        {footer}
      </Page>

      {/* ── PAGE 3 — What is strong, what is weak ─────────────────────── */}
      <Page size="A4" style={s.page} wrap={false}>
        <HeaderBar />
        <PageMarker index={2} />
        <PageTitle
          title={FREE_SUMMARY_PAGES[2].title}
          subtitle="The readings at both ends, with what they were built on"
        />

        <Eyebrow>Your strongest readings</Eyebrow>
        {strengths.map((sub) => (
          <ReadingRow
            key={`strong-${sub.key}`}
            label={DIM_LABELS[sub.key] ?? sub.label}
            score={sub.value}
            color={barColor(sub.value)}
            line={
              clip(sub.evidence?.[0], MAX_EVIDENCE_CHARS) ||
              clip(sub.rationale, MAX_RATIONALE_CHARS)
            }
          />
        ))}

        <View style={{ height: 10 }} />

        <Eyebrow>Your weakest readings</Eyebrow>
        {weaknesses.map((sub) => (
          <ReadingRow
            key={`weak-${sub.key}`}
            label={DIM_LABELS[sub.key] ?? sub.label}
            score={sub.value}
            color={barColor(sub.value)}
            line={
              clip(sub.gaps?.[0], MAX_EVIDENCE_CHARS) ||
              clip(sub.rationale, MAX_RATIONALE_CHARS)
            }
          />
        ))}

        {analysis.riskPenalties.length > 0 && (
          <View style={{ marginTop: 6 }}>
            <Eyebrow>Flagged in the input</Eyebrow>
            {analysis.riskPenalties.slice(0, 3).map((risk) => (
              <Bullet
                key={risk.label}
                color={C.amber600}
                text={`${risk.label} — ${clip(risk.reason, 130)}`}
              />
            ))}
          </View>
        )}

        {footer}
      </Page>

      {/* ── PAGE 4 — The gaps that cost you most ──────────────────────── */}
      <Page size="A4" style={s.page} wrap={false}>
        <HeaderBar />
        <PageMarker index={3} />
        <PageTitle
          title={FREE_SUMMARY_PAGES[3].title}
          subtitle="Missing evidence, worst first, with what closing it is worth"
        />

        {gapUpside > 0 && (
          <View style={{ marginBottom: 12 }}>
            <InsightBox
              label="THE HEADLINE"
              text={`Closing the ${gaps.length} gaps below is worth about ${gapUpside} points of index. Most of them are documents you can produce this month, not milestones you have to go and earn.`}
            />
          </View>
        )}

        {gaps.length === 0 && (
          <Text style={{ fontSize: 9, color: C.ink600, lineHeight: 1.6 }}>
            Nothing material is missing from what you gave us. That is rare —
            the next lever is traction, not paperwork.
          </Text>
        )}

        {gaps.map((gap, i) => (
          <View
            key={`${gap.priority}-${gap.label}-${i}`}
            style={{
              marginBottom: 10,
              padding: 9,
              backgroundColor: C.surface50,
              borderRadius: 5,
              borderLeftWidth: 2,
              borderLeftColor: gap.priority === "P0" ? C.red600 : C.amber600,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "baseline",
              }}
            >
              <Text
                style={{
                  fontSize: 9,
                  fontFamily: "Helvetica-Bold",
                  color: C.ink800,
                }}
              >
                {`${gap.priority} · ${clip(gap.label, 70)}`}
              </Text>
              <Text
                style={{
                  fontSize: 8.5,
                  fontFamily: "Helvetica-Bold",
                  color: C.emerald600,
                }}
              >
                {`+${gap.impact}`}
              </Text>
            </View>
            <Text
              style={{
                fontSize: 8,
                color: C.ink600,
                lineHeight: 1.5,
                marginTop: 3,
              }}
            >
              {clip(gap.action, 190)}
            </Text>
          </View>
        ))}

        {footer}
      </Page>

      {/* ── PAGE 5 — What to do next ──────────────────────────────────── */}
      <Page size="A4" style={s.page} wrap={false}>
        <HeaderBar />
        <PageMarker index={4} />
        <PageTitle
          title={FREE_SUMMARY_PAGES[4].title}
          subtitle="Your prioritised actions — and what the full report adds"
        />

        {actions.length === 0 && (
          <Text style={{ fontSize: 9, color: C.ink600, lineHeight: 1.6 }}>
            No prioritised actions were produced for this run. Re-run with more
            detail — a deck or a live site gives the analysis more to work with
            than a few sentences.
          </Text>
        )}

        {actions.map((action, i) => (
          <ActionItem
            key={`${action.title}-${i}`}
            num={i + 1}
            text={`${action.title} (${action.priority} · ${action.impact})`}
            detail={clip(action.detail, 200)}
          />
        ))}

        <View
          style={{
            marginTop: 14,
            padding: 12,
            backgroundColor: C.brand50,
            borderRadius: 6,
            borderLeftWidth: 3,
            borderLeftColor: C.brand600,
          }}
        >
          <Text
            style={{
              fontSize: 10,
              fontFamily: "Helvetica-Bold",
              color: C.ink900,
              marginBottom: 3,
            }}
          >
            What the full written report adds — A$3, one payment
          </Text>
          <Text
            style={{
              fontSize: 8,
              color: C.ink600,
              lineHeight: 1.5,
              marginBottom: 7,
            }}
          >
            These five pages are the summary. The full report is the working
            behind them, and it is ten pages or more:
          </Text>
          {PAID_REPORT_ADDITIONS.map((line) => (
            <Bullet key={line} color={C.brand600} text={line} />
          ))}
          <Text
            style={{
              fontSize: 8,
              color: C.ink700,
              lineHeight: 1.5,
              marginTop: 7,
            }}
          >
            blockid.au/one-click-report — A$3.00 inc. GST, no account, no
            subscription.
          </Text>
        </View>

        <Text
          style={{
            fontSize: 7.5,
            color: C.ink500,
            lineHeight: 1.5,
            marginTop: 14,
          }}
        >
          Prepared by BlockID.au — Auschain Pty Ltd, ACN 659 615 111, ABN 79 659
          615 111, Sydney NSW, Australia. The Startup Value Index is a
          directional analysis, not a financial valuation or an investment
          recommendation. BlockID does not hold an Australian Financial Services
          Licence. Seek independent professional advice. Prices in AUD
          inclusive of GST.
        </Text>

        {footer}
      </Page>
    </Document>
  );
}

export default SVISummaryPDF;
