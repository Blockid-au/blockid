// Branded PDF for the Founder Pack (Idea-phase artifact).
//
// Server-side rendering only via @react-pdf/renderer. Mirrors the visual
// language of score-pdf.tsx (dark navy + brand blue) so a founder who graduates
// from idea-phase to wedge sees a coherent brand.

import * as React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { HydratedFounderPack } from "@/lib/idea-phase/persist";

const C = {
  ink950: "#0B1220",
  ink900: "#0F172A",
  ink800: "#172033",
  ink700: "#1F2A44",
  slate50: "#F8FAFC",
  slate200: "#E2E8F0",
  slate300: "#CBD5E1",
  slate400: "#94A3B8",
  slate500: "#64748B",
  brand400: "#5B9AEB",
  brand500: "#3B7DD8",
  amber400: "#FBBF24",
  white: "#FFFFFF",
} as const;

const styles = StyleSheet.create({
  page: {
    backgroundColor: C.ink950,
    color: C.slate50,
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 48,
    fontFamily: "Helvetica",
    fontSize: 10,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  brand: { flexDirection: "row", alignItems: "center" },
  logoSquare: {
    width: 18,
    height: 18,
    backgroundColor: C.brand500,
    borderRadius: 4,
    marginRight: 8,
  },
  brandText: { fontSize: 14, fontWeight: 700, color: C.slate50 },
  brandSub: { fontSize: 9, color: C.slate400, marginTop: 2 },
  eyebrow: {
    fontSize: 8,
    color: C.brand400,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    fontWeight: 600,
  },
  draftStamp: {
    fontSize: 8,
    color: C.amber400,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    fontWeight: 600,
  },
  title: { fontSize: 24, fontWeight: 700, color: C.slate50, marginTop: 6 },
  subtitle: {
    fontSize: 11,
    color: C.slate400,
    marginTop: 6,
    lineHeight: 1.5,
  },

  heroRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
  },
  heroBox: {
    flex: 1,
    backgroundColor: C.ink800,
    borderColor: C.ink700,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  heroLabel: {
    fontSize: 8,
    color: C.slate500,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  heroValue: {
    fontSize: 14,
    color: C.slate50,
    marginTop: 6,
    fontFamily: "Helvetica-Bold",
  },
  heroDetail: {
    fontSize: 9,
    color: C.slate400,
    marginTop: 4,
    lineHeight: 1.4,
  },

  sectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: C.slate50,
    marginTop: 24,
    marginBottom: 10,
  },

  card: {
    backgroundColor: C.ink900,
    borderColor: C.ink700,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
  },

  table: {
    borderColor: C.ink700,
    borderWidth: 1,
    borderRadius: 8,
    overflow: "hidden",
  },
  tableHeadRow: {
    flexDirection: "row",
    backgroundColor: C.ink800,
    borderBottomColor: C.ink700,
    borderBottomWidth: 1,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomColor: C.ink700,
    borderBottomWidth: 1,
  },
  tableRowLast: { flexDirection: "row" },
  th: {
    padding: 8,
    color: C.slate400,
    fontSize: 9,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  td: {
    padding: 8,
    color: C.slate200,
    fontSize: 10,
  },

  bullet: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  bulletDot: {
    width: 4,
    height: 4,
    backgroundColor: C.brand400,
    borderRadius: 2,
    marginTop: 5,
    marginRight: 8,
  },
  bulletText: {
    flex: 1,
    fontSize: 10,
    color: C.slate200,
    lineHeight: 1.5,
  },

  callout: {
    marginTop: 18,
    backgroundColor: C.ink800,
    borderColor: C.brand500,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
  },
  calloutTitle: {
    fontSize: 11,
    color: C.brand400,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  calloutBody: {
    fontSize: 10,
    color: C.slate200,
    marginTop: 6,
    lineHeight: 1.5,
  },

  footer: {
    position: "absolute",
    bottom: 24,
    left: 48,
    right: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    color: C.slate500,
    fontSize: 8,
    paddingTop: 10,
    borderTopColor: C.ink700,
    borderTopWidth: 1,
  },
});

export interface FounderPackPdfData {
  pack: HydratedFounderPack;
  shareUrl: string;
}

function fmtAud(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "$0";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${n.toFixed(digits)}%`;
}

function ymd(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

export function FounderPackPDF({ data }: { data: FounderPackPdfData }) {
  const { pack, shareUrl } = data;
  const ev = pack.evaluation;
  const sp = pack.split;
  const fp = pack.funding;

  const founderName =
    pack.user.displayName || pack.user.email || "Founder";
  const ideaName = pack.ideaName || ev?.ideaName || "Untitled idea";

  return (
    <Document
      title={`BlockID Founder Pack — ${ideaName}`}
      author="BlockID"
      subject="Founder Pack"
      creator="BlockID"
      producer="BlockID"
    >
      {/* ----- Page 1: Cover + headline numbers ----- */}
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View style={styles.brand}>
            <View style={styles.logoSquare} />
            <View>
              <Text style={styles.brandText}>BlockID</Text>
              <Text style={styles.brandSub}>
                Trust layer for fundraising
              </Text>
            </View>
          </View>
          <Text style={styles.draftStamp}>v0 · pre-incorporation draft</Text>
        </View>

        <Text style={styles.eyebrow}>Founder Pack</Text>
        <Text style={styles.title}>{ideaName}</Text>
        <Text style={styles.subtitle}>
          Prepared for {founderName} on {ymd(pack.createdAt)}. This pack
          bundles your idea valuation, co-founder split and funding plan into
          one shareable artifact. It is a working draft for self-reflection
          and conversations — not legal, financial or investment advice.
        </Text>

        <View style={styles.heroRow}>
          <View style={styles.heroBox}>
            <Text style={styles.heroLabel}>Valuation band</Text>
            <Text style={styles.heroValue}>
              {ev
                ? `${fmtAud(ev.valuationLowAud)} – ${fmtAud(ev.valuationHighAud)}`
                : "Not run yet"}
            </Text>
            <Text style={styles.heroDetail}>
              {ev
                ? `Mid-point ${fmtAud(ev.valuationMidAud)} · Berkus + Scorecard`
                : "Run /tools/idea-valuation to add this."}
            </Text>
          </View>
          <View style={styles.heroBox}>
            <Text style={styles.heroLabel}>Co-founders</Text>
            <Text style={styles.heroValue}>
              {sp ? `${sp.founders.length} founder${sp.founders.length === 1 ? "" : "s"}` : "—"}
            </Text>
            <Text style={styles.heroDetail}>
              {sp
                ? `Founders ${fmtPct(sp.reserves.foundersPct, 0)} · ESOP ${fmtPct(sp.reserves.esopPct, 0)}`
                : "Run /tools/equity-split to add this."}
            </Text>
          </View>
          <View style={styles.heroBox}>
            <Text style={styles.heroLabel}>Recommended raise</Text>
            <Text style={styles.heroValue}>
              {fp ? fmtAud(fp.recommendedRaise) : "—"}
            </Text>
            <Text style={styles.heroDetail}>
              {fp
                ? `Burn ${fmtAud(fp.monthlyBurnAud)} / mo · Need ${fmtAud(fp.totalNeedAud)}`
                : "Run /tools/funding-plan to add this."}
            </Text>
          </View>
        </View>

        {ev && (
          <>
            <Text style={styles.sectionTitle}>Top suggestions to lift valuation</Text>
            <View style={styles.card}>
              {(ev.suggestions ?? []).slice(0, 3).map((s) => (
                <View key={s.title} style={styles.bullet}>
                  <View style={styles.bulletDot} />
                  <Text style={styles.bulletText}>
                    <Text style={{ fontFamily: "Helvetica-Bold" }}>
                      {s.title}
                    </Text>
                    {"  "}
                    <Text style={{ color: C.slate400 }}>
                      (~+{fmtAud(s.upliftAud)})
                    </Text>
                    {"\n"}
                    {s.detail}
                  </Text>
                </View>
              ))}
              {(!ev.suggestions || ev.suggestions.length === 0) && (
                <Text style={styles.bulletText}>
                  No suggestions — your evaluation is already at the ceiling
                  for the inputs given.
                </Text>
              )}
              <Text style={[styles.heroDetail, { marginTop: 8 }]}>
                {ev.confidenceText ?? ""}
              </Text>
            </View>
          </>
        )}

        <View style={styles.footer} fixed>
          <Text>{shareUrl}</Text>
          <Text>
            Generated {ymd(pack.createdAt)} · BlockID Founder Pack v0 · AU
            data residency
          </Text>
        </View>
      </Page>

      {/* ----- Page 2: Equity split + funding plan ----- */}
      {(sp || fp) && (
        <Page size="A4" style={styles.page}>
          <View style={styles.headerRow}>
            <View style={styles.brand}>
              <View style={styles.logoSquare} />
              <Text style={styles.brandText}>BlockID</Text>
            </View>
            <Text style={styles.draftStamp}>v0 · pre-incorporation draft</Text>
          </View>

          {sp && (
            <>
              <Text style={styles.eyebrow}>Co-founder split</Text>
              <Text style={[styles.title, { fontSize: 18 }]}>
                Equity allocation
              </Text>
              <Text style={styles.subtitle}>
                Weighted-points split with {fmtPct(sp.reserves.esopPct, 0)} ESOP
                reserve and {fmtPct(sp.reserves.firstHirePct, 0)} first-hire
                reserve. Vesting: {sp.vesting.cliffMonths}-month cliff over{" "}
                {sp.vesting.totalMonths} months.
              </Text>

              <View style={[styles.table, { marginTop: 12 }]}>
                <View style={styles.tableHeadRow}>
                  <Text style={[styles.th, { width: "32%" }]}>Founder</Text>
                  <Text style={[styles.th, { width: "20%" }]}>Role</Text>
                  <Text style={[styles.th, { width: "16%" }]}>Time</Text>
                  <Text
                    style={[styles.th, { width: "16%", textAlign: "right" }]}
                  >
                    Points
                  </Text>
                  <Text
                    style={[styles.th, { width: "16%", textAlign: "right" }]}
                  >
                    Equity
                  </Text>
                </View>
                {sp.allocations.map((a, i, arr) => {
                  const fb = sp.founders.find((f) => f.id === a.id);
                  return (
                    <View
                      key={a.id}
                      style={
                        i === arr.length - 1
                          ? styles.tableRowLast
                          : styles.tableRow
                      }
                    >
                      <Text style={[styles.td, { width: "32%" }]}>
                        {a.name || "—"}
                      </Text>
                      <Text style={[styles.td, { width: "20%" }]}>
                        {a.role || fb?.role || "—"}
                      </Text>
                      <Text style={[styles.td, { width: "16%" }]}>
                        {fb?.time ?? "—"}
                      </Text>
                      <Text
                        style={[styles.td, { width: "16%", textAlign: "right" }]}
                      >
                        {Math.round(a.points)}
                      </Text>
                      <Text
                        style={[
                          styles.td,
                          {
                            width: "16%",
                            textAlign: "right",
                            color: C.brand400,
                            fontFamily: "Helvetica-Bold",
                          },
                        ]}
                      >
                        {fmtPct(a.pct, 1)}
                      </Text>
                    </View>
                  );
                })}
              </View>

              {sp.flags && sp.flags.length > 0 && (
                <View style={[styles.card, { marginTop: 12 }]}>
                  <Text style={styles.heroLabel}>Fairness flags</Text>
                  {sp.flags.map((f, i) => (
                    <View key={`flag-${i}`} style={[styles.bullet, { marginTop: 6 }]}>
                      <View
                        style={[
                          styles.bulletDot,
                          {
                            backgroundColor:
                              f.level === "warn" ? C.amber400 : C.brand400,
                          },
                        ]}
                      />
                      <Text style={styles.bulletText}>{f.message}</Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}

          {fp && (
            <>
              <Text style={styles.sectionTitle}>Funding plan</Text>
              <View style={styles.card}>
                <View style={[styles.heroRow, { marginTop: 0 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.heroLabel}>Monthly burn</Text>
                    <Text style={[styles.heroValue, { fontSize: 12 }]}>
                      {fmtAud(fp.monthlyBurnAud)}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.heroLabel}>Total need</Text>
                    <Text style={[styles.heroValue, { fontSize: 12 }]}>
                      {fmtAud(fp.totalNeedAud)}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.heroLabel}>Recommended raise</Text>
                    <Text
                      style={[
                        styles.heroValue,
                        { fontSize: 12, color: C.brand400 },
                      ]}
                    >
                      {fmtAud(fp.recommendedRaise)}
                    </Text>
                  </View>
                </View>

                <Text style={[styles.heroDetail, { marginTop: 12 }]}>
                  Pre-money {fmtAud(fp.inputs.preMoneyAud)} · ESOP{" "}
                  {fmtPct(fp.inputs.esopPct, 0)} · Runway{" "}
                  {fp.inputs.runwayMonths} months · Buffer{" "}
                  {fmtPct(fp.inputs.bufferPct, 0)}
                </Text>
              </View>

              {fp.result.scenarios && fp.result.scenarios.length > 0 && (
                <>
                  <Text style={[styles.eyebrow, { marginTop: 16 }]}>
                    Sensitivity
                  </Text>
                  <View style={[styles.table, { marginTop: 8 }]}>
                    <View style={styles.tableHeadRow}>
                      <Text style={[styles.th, { width: "30%" }]}>
                        Scenario
                      </Text>
                      <Text
                        style={[styles.th, { width: "25%", textAlign: "right" }]}
                      >
                        Raise
                      </Text>
                      <Text
                        style={[styles.th, { width: "22%", textAlign: "right" }]}
                      >
                        Investor %
                      </Text>
                      <Text
                        style={[styles.th, { width: "23%", textAlign: "right" }]}
                      >
                        Founders %
                      </Text>
                    </View>
                    {fp.result.scenarios.map((s, i, arr) => (
                      <View
                        key={s.label}
                        style={
                          i === arr.length - 1
                            ? styles.tableRowLast
                            : styles.tableRow
                        }
                      >
                        <Text style={[styles.td, { width: "30%" }]}>
                          {s.label}
                        </Text>
                        <Text
                          style={[
                            styles.td,
                            { width: "25%", textAlign: "right" },
                          ]}
                        >
                          {fmtAud(s.externalRaiseAud)}
                        </Text>
                        <Text
                          style={[
                            styles.td,
                            { width: "22%", textAlign: "right" },
                          ]}
                        >
                          {fmtPct(s.investorPct, 1)}
                        </Text>
                        <Text
                          style={[
                            styles.td,
                            { width: "23%", textAlign: "right" },
                          ]}
                        >
                          {fmtPct(s.founderPctAfter, 1)}
                        </Text>
                      </View>
                    ))}
                  </View>
                </>
              )}
            </>
          )}

          <View style={styles.callout}>
            <Text style={styles.calloutTitle}>Next steps</Text>
            <Text style={styles.calloutBody}>
              When you incorporate, BlockID converts this Founder Pack into
              an Investor-Ready Score and dataroom. Save the share link below
              — every page in this PDF is a checkpoint, not a final answer.
            </Text>
          </View>

          <View style={styles.footer} fixed>
            <Text>{shareUrl}</Text>
            <Text>
              Generated {ymd(pack.createdAt)} · BlockID Founder Pack v0 · AU
              data residency
            </Text>
          </View>
        </Page>
      )}
    </Document>
  );
}

export async function renderFounderPackPdf(
  data: FounderPackPdfData,
): Promise<Buffer> {
  const buf = await renderToBuffer(<FounderPackPDF data={data} />);
  return buf as Buffer;
}
