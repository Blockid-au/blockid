/**
 * ABN + Trademark Guide PDF — Phase 3.1 deliverable.
 *
 * Consumes the `AbnTrademarkGuideOutput` shape from
 * `lib/agents/abn-trademark-guide.ts`. Renders a 3-page A4 report:
 *   Page 1: Cover, ABR walk-through, ASIC business-name walk-through.
 *   Page 2: Trademark search prompt, Nice classes, filing timeline + costs.
 *   Page 3: Strategic recommendations, pitfalls, next-actions checklist,
 *           sources footer.
 */
import * as React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { AbnTrademarkGuideOutput } from "@/lib/agents/abn-trademark-guide";

const C = {
  ink900: "#0F172A",
  ink700: "#334155",
  ink500: "#64748B",
  ink400: "#94A3B8",
  surface200: "#E2E8F0",
  surface100: "#F1F5F9",
  brand600: "#2563EB",
  brand50: "#EFF6FF",
  amber700: "#B45309",
  amber50: "#FFFBEB",
  emerald700: "#047857",
  emerald50: "#ECFDF5",
  red700: "#B91C1C",
  red50: "#FEF2F2",
  white: "#FFFFFF",
};

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: C.ink700,
    backgroundColor: C.white,
    paddingHorizontal: 42,
    paddingVertical: 40,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: C.surface200,
    paddingBottom: 10,
  },
  brand: { fontSize: 14, fontFamily: "Helvetica-Bold", color: C.brand600 },
  subtitle: { fontSize: 8, color: C.ink400, marginTop: 2 },
  h1: { fontSize: 20, fontFamily: "Helvetica-Bold", color: C.ink900, marginTop: 6 },
  section: { marginBottom: 14 },
  sectionTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: C.ink500,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: C.surface200,
    paddingBottom: 3,
  },
  para: { fontSize: 10, color: C.ink700, lineHeight: 1.5, marginBottom: 6 },
  smallPara: { fontSize: 8.5, color: C.ink500, lineHeight: 1.4, marginBottom: 4 },
  callout: {
    backgroundColor: C.brand50,
    padding: 10,
    borderRadius: 4,
    borderLeftWidth: 3,
    borderLeftColor: C.brand600,
    marginBottom: 10,
  },
  calloutWarn: {
    backgroundColor: C.amber50,
    padding: 10,
    borderRadius: 4,
    borderLeftWidth: 3,
    borderLeftColor: C.amber700,
    marginBottom: 10,
  },
  calloutOk: {
    backgroundColor: C.emerald50,
    padding: 10,
    borderRadius: 4,
    borderLeftWidth: 3,
    borderLeftColor: C.emerald700,
    marginBottom: 10,
  },
  stepRow: {
    flexDirection: "row",
    marginBottom: 8,
    alignItems: "flex-start",
  },
  stepNum: {
    width: 20,
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: C.brand600,
  },
  stepBody: { flex: 1 },
  stepTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: C.ink900,
    marginBottom: 2,
  },
  stepDetail: { fontSize: 9.5, color: C.ink700, lineHeight: 1.4, marginBottom: 2 },
  stepUrl: { fontSize: 8, color: C.brand600 },
  classRow: {
    flexDirection: "row",
    borderBottomWidth: 0.3,
    borderBottomColor: C.surface200,
    paddingVertical: 6,
    alignItems: "flex-start",
  },
  classNo: {
    width: 40,
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: C.ink900,
  },
  classTitle: {
    width: 160,
    fontSize: 9.5,
    fontFamily: "Helvetica-Bold",
    color: C.ink900,
  },
  classRationale: { flex: 1, fontSize: 9, color: C.ink700, lineHeight: 1.4 },
  badgeRec: {
    fontSize: 7,
    backgroundColor: C.brand50,
    color: C.brand600,
    padding: 2,
    borderRadius: 3,
    width: 70,
    textAlign: "center",
    marginRight: 6,
  },
  badgeCons: {
    fontSize: 7,
    backgroundColor: C.amber50,
    color: C.amber700,
    padding: 2,
    borderRadius: 3,
    width: 70,
    textAlign: "center",
    marginRight: 6,
  },
  badgeOpt: {
    fontSize: 7,
    backgroundColor: C.surface100,
    color: C.ink500,
    padding: 2,
    borderRadius: 3,
    width: 70,
    textAlign: "center",
    marginRight: 6,
  },
  timelineRow: {
    flexDirection: "row",
    borderBottomWidth: 0.3,
    borderBottomColor: C.surface200,
    paddingVertical: 6,
    alignItems: "flex-start",
  },
  tlLabel: {
    width: 200,
    fontSize: 9.5,
    fontFamily: "Helvetica-Bold",
    color: C.ink900,
  },
  tlCost: {
    width: 60,
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: C.emerald700,
    textAlign: "right",
  },
  tlTime: { width: 90, fontSize: 8.5, color: C.ink500, textAlign: "center" },
  tlNote: { flex: 1, fontSize: 8.5, color: C.ink700, lineHeight: 1.4, marginLeft: 6 },
  bullet: { flexDirection: "row", marginBottom: 4 },
  dot: { width: 10, color: C.brand600 },
  bulletText: { flex: 1, fontSize: 10, color: C.ink700, lineHeight: 1.4 },
  check: { width: 14, color: C.emerald700, fontSize: 10 },
  checkText: { flex: 1, fontSize: 10, color: C.ink700, lineHeight: 1.4 },
  footer: {
    position: "absolute",
    bottom: 22,
    left: 42,
    right: 42,
    fontSize: 7.5,
    color: C.ink400,
  },
  sourceLine: { fontSize: 7.5, color: C.ink500, marginBottom: 2 },
});

function fmtAud(v: number): string {
  return `A$${v.toFixed(0)}`;
}

export interface AbnTrademarkGuidePdfInput {
  guide: AbnTrademarkGuideOutput;
  email?: string;
  founderName?: string;
}

export function AbnTrademarkGuidePDF({ input }: { input: AbnTrademarkGuidePdfInput }) {
  const { guide } = input;
  const today = new Date(guide.reportDateIso + "T00:00:00Z").toLocaleDateString(
    "en-AU",
    { day: "numeric", month: "long", year: "numeric" },
  );

  return (
    <Document
      title={`${guide.startupName} — ABN + Trademark Guide`}
      author="BlockID.au"
    >
      {/* Page 1 — Cover + ABR + ASIC business name */}
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.brand}>BlockID.au</Text>
            <Text style={s.subtitle}>ABN + Trademark Guide</Text>
            <Text style={s.h1}>{guide.startupName}</Text>
          </View>
          <View>
            <Text style={{ fontSize: 8, color: C.ink400, textAlign: "right" }}>
              {guide.sector}
            </Text>
            <Text style={{ fontSize: 8, color: C.ink400, textAlign: "right" }}>
              {today}
            </Text>
            {input.email && (
              <Text style={{ fontSize: 8, color: C.ink400, textAlign: "right" }}>
                {input.email}
              </Text>
            )}
          </View>
        </View>

        {guide.abnLookup && (
          <View
            style={
              guide.abnLookup.valid_checksum && guide.abnLookup.live
                ? s.calloutOk
                : s.calloutWarn
            }
          >
            <Text
              style={{
                fontSize: 8,
                fontFamily: "Helvetica-Bold",
                color: C.ink900,
                marginBottom: 2,
              }}
            >
              ABR live lookup
            </Text>
            {guide.abnLookup.valid_checksum && guide.abnLookup.live ? (
              <Text style={{ fontSize: 9.5, color: C.ink700, lineHeight: 1.4 }}>
                {guide.abnLookup.live.entity_name ?? "—"} ·{" "}
                {guide.abnLookup.live.abn_status ?? "unknown status"} ·{" "}
                GST: {guide.abnLookup.live.gst_registered ? "registered" : "not registered"}
              </Text>
            ) : (
              <Text style={{ fontSize: 9.5, color: C.ink700 }}>
                {guide.abnLookup.live_error ?? "Live lookup unavailable — verify at abr.gov.au."}
              </Text>
            )}
          </View>
        )}

        <View style={s.callout}>
          <Text style={{ ...s.para, marginBottom: 0 }}>
            This guide walks you through Australia&apos;s two foundational
            filings — the ABN via ABR and your trade mark via IP Australia —
            with direct links, cost anchors, and a filing-timeline checklist.
          </Text>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Section 1 — ABN registration</Text>
          {guide.abnSteps.map((step, i) => (
            <View key={i} style={s.stepRow}>
              <Text style={s.stepNum}>{i + 1}.</Text>
              <View style={s.stepBody}>
                <Text style={s.stepTitle}>{step.title}</Text>
                <Text style={s.stepDetail}>{step.detail}</Text>
                {step.url && <Text style={s.stepUrl}>{step.url}</Text>}
              </View>
            </View>
          ))}
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Section 2 — ASIC business name</Text>
          <Text style={s.smallPara}>
            A business name (A$44 / 1 year or A$102 / 3 years via ASIC Connect)
            protects the trading name you use publicly. It does NOT give you
            trademark rights — those come from Section 4 onward.
          </Text>
          {guide.businessNameSteps.map((step, i) => (
            <View key={i} style={s.stepRow}>
              <Text style={s.stepNum}>{i + 1}.</Text>
              <View style={s.stepBody}>
                <Text style={s.stepTitle}>{step.title}</Text>
                <Text style={s.stepDetail}>{step.detail}</Text>
                {step.url && <Text style={s.stepUrl}>{step.url}</Text>}
              </View>
            </View>
          ))}
        </View>

        <Text style={s.footer}>
          Prepared by BlockID.au — Page 1 of 3 · ABN + Trademark Guide
        </Text>
      </Page>

      {/* Page 2 — Trademark search + Nice classes + timeline */}
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.brand}>BlockID.au</Text>
            <Text style={s.subtitle}>Trade mark search &amp; class selection</Text>
          </View>
          <View>
            <Text style={{ fontSize: 8, color: C.ink400, textAlign: "right" }}>
              {guide.startupName}
            </Text>
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Section 3 — Trade mark search</Text>
          <Text style={s.para}>
            IP Australia does not expose a public trade-mark search API. Open
            the direct search link below for &quot;{guide.proposedTradingName}&quot;
            and review identical + phonetic hits before filing:
          </Text>
          <View style={s.callout}>
            <Text
              style={{
                fontSize: 9,
                fontFamily: "Helvetica-Bold",
                color: C.brand600,
              }}
            >
              {guide.trademarkSearchUrl}
            </Text>
          </View>
          <Text style={s.smallPara}>
            Flag any hit in your target Nice classes (Section 4). A live
            registration in the same or a related class is a strong signal to
            rebrand before filing.
          </Text>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Section 4 — Nice class selection</Text>
          <Text style={s.smallPara}>
            Nice classes group goods and services for trade-mark filings. For a
            typical SaaS venture, Classes 9 and 42 are almost always required.
          </Text>
          {guide.niceClasses.map((c) => {
            const badge =
              c.priority === "recommended"
                ? s.badgeRec
                : c.priority === "consider"
                  ? s.badgeCons
                  : s.badgeOpt;
            return (
              <View key={c.classNumber} style={s.classRow}>
                <Text style={s.classNo}>#{c.classNumber}</Text>
                <Text style={s.classTitle}>{c.title}</Text>
                <Text style={badge}>{c.priority.toUpperCase()}</Text>
                <Text style={s.classRationale}>{c.rationale}</Text>
              </View>
            );
          })}
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Section 5 — Filing timeline &amp; costs</Text>
          {guide.timeline.map((row) => (
            <View key={row.path} style={s.timelineRow}>
              <Text style={s.tlLabel}>{row.label}</Text>
              <Text style={s.tlCost}>{fmtAud(row.costPerClassAud)}</Text>
              <Text style={s.tlTime}>{row.timeframeWeeks}</Text>
              <Text style={s.tlNote}>{row.note}</Text>
            </View>
          ))}
          <Text style={{ ...s.smallPara, marginTop: 8 }}>
            Standard filings run A$250–$400 per class depending on
            specification path (Pick List vs custom). Add opposition &amp;
            examination costs if a competitor challenges the mark.
          </Text>
        </View>

        <Text style={s.footer}>
          Prepared by BlockID.au — Page 2 of 3 · ABN + Trademark Guide
        </Text>
      </Page>

      {/* Page 3 — Recommendations, pitfalls, next actions, sources */}
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.brand}>BlockID.au</Text>
            <Text style={s.subtitle}>Recommendations &amp; next actions</Text>
          </View>
          <View>
            <Text style={{ fontSize: 8, color: C.ink400, textAlign: "right" }}>
              {guide.startupName}
            </Text>
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Strategic recommendations</Text>
          {guide.strategicRecommendations.map((r, i) => (
            <View key={i} style={s.bullet}>
              <Text style={s.dot}>•</Text>
              <Text style={s.bulletText}>{r}</Text>
            </View>
          ))}
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Section 6 — Common pitfalls</Text>
          {guide.commonPitfalls.map((p, i) => (
            <View key={i} style={s.bullet}>
              <Text style={s.dot}>!</Text>
              <Text style={s.bulletText}>{p}</Text>
            </View>
          ))}
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Section 7 — Next actions checklist</Text>
          {guide.nextActions.map((n, i) => (
            <View key={i} style={s.bullet}>
              <Text style={s.check}>[ ]</Text>
              <Text style={s.checkText}>{n}</Text>
            </View>
          ))}
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Sources</Text>
          {guide.sources.map((src, i) => (
            <Text key={i} style={s.sourceLine}>
              {src}
            </Text>
          ))}
        </View>

        <Text style={s.footer}>
          Prepared by BlockID.au — Page 3 of 3 · General information only, not
          legal advice. Consult a registered trade marks attorney before filing.
        </Text>
      </Page>
    </Document>
  );
}

export async function renderAbnTrademarkGuidePdf(
  input: AbnTrademarkGuidePdfInput,
): Promise<Buffer> {
  const buf = await renderToBuffer(<AbnTrademarkGuidePDF input={input} />);
  return buf as Buffer;
}
