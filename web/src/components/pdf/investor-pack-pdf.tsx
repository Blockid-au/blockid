// Investor pack PDF — one artefact a founder can send to an investor.
//
// Renders the `InvestorPackData` produced by lib/investor-pack-assembler.ts.
// Reuses the @react-pdf/renderer stack the rest of the app already uses
// (see lib/pdf/svi-report-pdf.tsx, lib/pdf/investor-pack.tsx).
//
// Layout (in page order):
//   1. Cover              — project name, SVI grade, valuation range, date
//   2. One-page summary   — headline + snapshot grid + narrative
//   3. SVI radar / dims   — table of dimension scores
//   4. Fundraise checklist — snapshot grouped by category
//   5. Valuation & ask    — valuation methods + raise + use-of-funds
//   6. AU comparables     — sector- + stage-matched raises
//   7. Team + cap-table   — snapshot of both, with "Not yet on file" fallbacks
//   8. Contact + AFSL     — disclaimer, Auschain footer, contact block
//
// Guardrails:
//   - Missing data → "Not yet on file" placeholder (never fabricates numbers).
//   - Every page carries the Not-financial-advice + Auschain footer.

import * as React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import type { InvestorPackData } from "@/lib/investor-pack-assembler";

/* ─── Palette — mirrors lib/pdf/investor-pack.tsx so the two artefacts read
 *     as one family until they get merged in a later cleanup. */
const C = {
  brand700: "#1d4ed8",
  brand600: "#2563eb",
  brand100: "#dbeafe",
  brand50: "#eff6ff",
  ink900: "#0f172a",
  ink800: "#1e293b",
  ink700: "#334155",
  ink600: "#475569",
  ink500: "#64748b",
  ink400: "#94a3b8",
  ink300: "#cbd5e1",
  surface200: "#e2e8f0",
  surface100: "#f1f5f9",
  surface50: "#f8fafc",
  emerald600: "#059669",
  emerald100: "#d1fae5",
  amber700: "#b45309",
  amber100: "#fef3c7",
  red600: "#dc2626",
  white: "#ffffff",
} as const;

const AUSCHAIN_LINE =
  "Auschain PTY LTD · ACN 659 615 111 · ABN 79 659 615 111 · Sydney NSW";

/* ─── Styles ────────────────────────────────────────────────────────────── */
const s = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 64,
    paddingHorizontal: 48,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: C.ink800,
    backgroundColor: C.white,
  },
  headerBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: C.brand600,
  },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 48,
    right: 48,
    borderTopWidth: 0.5,
    borderTopColor: C.surface200,
    paddingTop: 6,
  },
  footerLead: {
    fontSize: 7,
    color: C.ink600,
    lineHeight: 1.3,
  },
  footerLine: {
    fontSize: 6.5,
    color: C.ink400,
    marginTop: 2,
    lineHeight: 1.3,
  },
  label: {
    fontSize: 7.5,
    color: C.ink500,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    fontFamily: "Helvetica-Bold",
  },
  h1: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    color: C.ink900,
    marginBottom: 4,
  },
  h1Sub: { fontSize: 10, color: C.ink500, marginBottom: 14 },
  h2: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: C.ink800,
    marginTop: 14,
    marginBottom: 6,
  },
  bodyPara: {
    fontSize: 10,
    color: C.ink700,
    lineHeight: 1.55,
    marginBottom: 8,
  },
  chip: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: C.brand50,
    color: C.brand700,
    borderRadius: 999,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    marginBottom: 8,
    marginTop: 2,
  },
  gradeBadge: {
    borderWidth: 1.5,
    borderColor: C.brand600,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 110,
  },
  gradeLetter: {
    fontSize: 40,
    fontFamily: "Helvetica-Bold",
    color: C.brand700,
    lineHeight: 1,
  },
  gradeScore: {
    fontSize: 9,
    color: C.ink500,
    marginTop: 4,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: C.surface100,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderTopWidth: 0.5,
    borderTopColor: C.surface200,
  },
  tableHeaderCell: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: C.ink700,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  tableCell: {
    fontSize: 9,
    color: C.ink700,
  },
  placeholderBox: {
    padding: 14,
    backgroundColor: C.surface50,
    borderWidth: 0.5,
    borderColor: C.surface200,
    borderStyle: "dashed",
    borderRadius: 6,
    marginTop: 4,
  },
  placeholderText: {
    fontSize: 9,
    color: C.ink500,
    fontStyle: "italic",
    textAlign: "center",
  },
  statTile: {
    flex: 1,
    borderWidth: 0.5,
    borderColor: C.surface200,
    borderRadius: 6,
    padding: 10,
    backgroundColor: C.surface50,
    minHeight: 68,
  },
  statValue: {
    fontSize: 15,
    fontFamily: "Helvetica-Bold",
    color: C.ink900,
    marginTop: 4,
  },
  statSub: {
    fontSize: 8,
    color: C.ink500,
    marginTop: 2,
  },
  bandChip: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
  },
});

/* ─── Helpers ───────────────────────────────────────────────────────────── */

function formatAud(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return "—";
  if (v >= 1_000_000_000) return `A$${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `A$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `A$${(v / 1_000).toFixed(1)}K`;
  return `A$${Math.round(v).toLocaleString("en-AU")}`;
}

function scoreBarColor(score: number): string {
  if (score >= 70) return C.emerald600;
  if (score >= 50) return C.brand600;
  if (score >= 35) return C.amber700;
  return C.red600;
}

function statusColor(status: string): string {
  if (status === "done") return C.emerald600;
  if (status === "partial") return C.amber700;
  return C.ink400;
}

function statusLabel(status: string): string {
  if (status === "done") return "Done";
  if (status === "partial") return "Partial";
  return "Missing";
}

function bandStyle(band: string): { bg: string; fg: string } {
  if (band === "ready") return { bg: C.emerald100, fg: C.emerald600 };
  if (band === "nearly-ready") return { bg: C.amber100, fg: C.amber700 };
  return { bg: C.brand50, fg: C.brand700 };
}

function bandLabel(band: string): string {
  if (band === "ready") return "Investor ready";
  if (band === "nearly-ready") return "Nearly ready";
  return "Not yet ready";
}

function prettyCategory(cat: string): string {
  switch (cat) {
    case "story":
      return "Story";
    case "metrics":
      return "Metrics";
    case "team":
      return "Team";
    case "cap-table":
      return "Cap table";
    case "legal":
      return "Legal";
    case "data-room":
      return "Data room";
    default:
      return cat;
  }
}

function prettyStage(stage: string): string {
  switch (stage) {
    case "preseed":
      return "Pre-seed";
    case "seed":
      return "Seed";
    case "seriesA":
      return "Series A";
    case "seriesB":
      return "Series B";
    default:
      return stage;
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-AU", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/* ─── Shared components ─────────────────────────────────────────────────── */

function HeaderBar() {
  return <View style={s.headerBar} fixed />;
}

function RegulatoryFooter() {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerLead}>
        <Text style={{ fontFamily: "Helvetica-Bold" }}>
          General information only. Not financial advice.
        </Text>{" "}
        Comparables from public reporting. This document is not an offer of
        securities.
      </Text>
      <Text style={s.footerLine}>
        Investor Pack · {AUSCHAIN_LINE}
        {"  "}
        <Text
          render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
            `· page ${pageNumber} / ${totalPages}`
          }
        />
      </Text>
    </View>
  );
}

function Placeholder({ label }: { label: string }) {
  return (
    <View style={s.placeholderBox}>
      <Text style={s.placeholderText}>{label}</Text>
    </View>
  );
}

/* ─── 1. Cover ──────────────────────────────────────────────────────────── */

function CoverPage({ data }: { data: InvestorPackData }) {
  const { project, svi, valuation, generatedAt } = data;
  return (
    <Page size="A4" style={s.page}>
      <HeaderBar />
      <View style={{ marginTop: 60 }}>
        <Text style={s.label}>Investor Pack · Prepared by BlockID.au</Text>
        <Text
          style={{
            fontSize: 32,
            fontFamily: "Helvetica-Bold",
            color: C.ink900,
            marginTop: 8,
          }}
        >
          {project.name}
        </Text>
        {project.sector && <Text style={s.chip}>{project.sector.toUpperCase()}</Text>}
        <Text style={{ fontSize: 9, color: C.ink500, marginTop: 6 }}>
          Generated {formatDate(generatedAt)}
        </Text>
      </View>

      <View
        style={{
          marginTop: 40,
          flexDirection: "row",
          alignItems: "center",
          gap: 24,
        }}
      >
        <View style={s.gradeBadge}>
          <Text style={s.gradeLetter}>{svi.grade}</Text>
          <Text style={s.gradeScore}>SVI {svi.total}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.label}>Valuation range</Text>
          <Text
            style={{
              fontSize: 18,
              fontFamily: "Helvetica-Bold",
              color: C.brand700,
              marginTop: 6,
            }}
          >
            {formatAud(valuation.lowAud)} – {formatAud(valuation.highAud)}
          </Text>
          <Text style={{ fontSize: 9, color: C.ink500, marginTop: 4 }}>
            Midpoint {formatAud(valuation.midAud)} · {valuation.method}
          </Text>
        </View>
      </View>

      <View style={{ position: "absolute", bottom: 80, left: 48, right: 48 }}>
        <Text style={{ fontSize: 8, color: C.ink500, lineHeight: 1.5 }}>
          Prepared for investor review. Confidential. Distribution outside the
          intended recipient requires prior written consent from the issuing
          company.
        </Text>
      </View>
      <RegulatoryFooter />
    </Page>
  );
}

/* ─── 2. One-page summary ───────────────────────────────────────────────── */

function SummaryPage({ data }: { data: InvestorPackData }) {
  const { project, svi, valuation, checklist, ask } = data;
  const band = bandStyle(checklist.band);
  return (
    <Page size="A4" style={s.page}>
      <HeaderBar />
      <Text style={s.h1}>One-page summary</Text>
      <Text style={s.h1Sub}>Snapshot for the reviewing investor</Text>

      <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
        <View style={s.statTile}>
          <Text style={s.label}>SVI</Text>
          <Text style={s.statValue}>
            {svi.grade}
            <Text style={{ fontSize: 10, color: C.ink500 }}> · {svi.total}</Text>
          </Text>
          <Text style={s.statSub}>Base 100 · higher is stronger</Text>
        </View>
        <View style={s.statTile}>
          <Text style={s.label}>Valuation midpoint</Text>
          <Text style={s.statValue}>{formatAud(valuation.midAud)}</Text>
          <Text style={s.statSub}>
            {formatAud(valuation.lowAud)} – {formatAud(valuation.highAud)}
          </Text>
        </View>
        <View style={s.statTile}>
          <Text style={s.label}>Ask</Text>
          <Text style={s.statValue}>
            {ask.raiseAmountAud > 0 ? formatAud(ask.raiseAmountAud) : "—"}
          </Text>
          <Text style={s.statSub}>
            {ask.raiseAmountAud > 0 ? "See use of funds" : "Amount pending"}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6, marginBottom: 4 }}>
        <Text style={s.label}>Fundraise readiness</Text>
        <View style={[s.bandChip, { backgroundColor: band.bg, color: band.fg }]}>
          <Text>{bandLabel(checklist.band)} · {checklist.score}/100</Text>
        </View>
      </View>

      <Text style={s.bodyPara}>
        {project.name} is a{project.sector ? ` ${project.sector} ` : " "}
        Australian startup currently indexed at SVI {svi.total} ({svi.grade}).
        The BlockID valuation blend places pre-money value in the{" "}
        {formatAud(valuation.lowAud)} – {formatAud(valuation.highAud)} band, with
        a midpoint of {formatAud(valuation.midAud)} using {valuation.method}.
      </Text>

      <Text style={s.bodyPara}>
        The fundraise-readiness checklist score is {checklist.score}/100 —{" "}
        {bandLabel(checklist.band).toLowerCase()}. Detailed dimension scores,
        the readiness checklist snapshot, and AU comparable raises appear on
        the following pages, together with the team, cap-table and ask.
      </Text>

      <RegulatoryFooter />
    </Page>
  );
}

/* ─── 3. SVI dimensions ─────────────────────────────────────────────────── */

function DimensionsPage({ data }: { data: InvestorPackData }) {
  const rows = data.svi.dimensions;
  return (
    <Page size="A4" style={s.page}>
      <HeaderBar />
      <Text style={s.h1}>SVI dimension scores</Text>
      <Text style={s.h1Sub}>Per-dimension breakdown of the composite grade</Text>

      {rows.length === 0 && (
        <Placeholder label="Not yet on file — run an SVI analysis in the workspace to populate this table." />
      )}

      {rows.length > 0 && (
        <View style={{ borderWidth: 0.5, borderColor: C.surface200, borderRadius: 4 }}>
          <View style={s.tableHeader}>
            <Text style={[s.tableHeaderCell, { width: "70%" }]}>Dimension</Text>
            <Text style={[s.tableHeaderCell, { width: "30%", textAlign: "right" }]}>
              Score / 100
            </Text>
          </View>
          {rows.map((row, i) => (
            <View
              key={`${row.label}-${i}`}
              style={[
                s.tableRow,
                { backgroundColor: i % 2 === 0 ? C.white : C.surface50 },
              ]}
            >
              <Text style={[s.tableCell, { width: "70%" }]}>{row.label}</Text>
              <Text
                style={[
                  s.tableCell,
                  {
                    width: "30%",
                    textAlign: "right",
                    fontFamily: "Helvetica-Bold",
                    color: scoreBarColor(row.score),
                  },
                ]}
              >
                {Math.round(row.score)}
              </Text>
            </View>
          ))}
        </View>
      )}

      <Text
        style={{
          marginTop: 12,
          fontSize: 8,
          color: C.ink500,
          fontStyle: "italic",
          lineHeight: 1.4,
        }}
      >
        Scores are indicators of evidence strength (0–100 per dimension). The
        composite index sums a base of 100 with signed adjustments and stage
        bonuses, so higher-stage startups routinely index above 150.
      </Text>

      <RegulatoryFooter />
    </Page>
  );
}

/* ─── 4. Fundraise checklist ────────────────────────────────────────────── */

function ChecklistPage({ data }: { data: InvestorPackData }) {
  const { checklist } = data;
  const band = bandStyle(checklist.band);
  const categoriesWithItems = Object.entries(checklist.groupedItems).filter(
    ([, items]) => items.length > 0,
  );
  return (
    <Page size="A4" style={s.page}>
      <HeaderBar />
      <Text style={s.h1}>Fundraise readiness</Text>
      <Text style={s.h1Sub}>
        Checklist snapshot — {checklist.score}/100 ·{" "}
        <Text style={[s.bandChip, { backgroundColor: band.bg, color: band.fg }]}>
          {bandLabel(checklist.band)}
        </Text>
      </Text>

      {categoriesWithItems.length === 0 && (
        <Placeholder label="Not yet on file — the readiness checklist populates from the SVI signals + fundraise wizard." />
      )}

      {categoriesWithItems.map(([cat, items]) => (
        <View key={cat} style={{ marginTop: 8 }}>
          <Text style={s.h2}>{prettyCategory(cat)}</Text>
          <View style={{ borderWidth: 0.5, borderColor: C.surface200, borderRadius: 4 }}>
            {items.map((it, i) => (
              <View
                key={`${cat}-${i}`}
                style={[
                  s.tableRow,
                  {
                    backgroundColor: i % 2 === 0 ? C.white : C.surface50,
                    borderTopWidth: i === 0 ? 0 : 0.5,
                  },
                ]}
              >
                <Text style={[s.tableCell, { width: "78%" }]}>{it.label}</Text>
                <Text
                  style={[
                    s.tableCell,
                    {
                      width: "22%",
                      textAlign: "right",
                      fontFamily: "Helvetica-Bold",
                      color: statusColor(it.status),
                    },
                  ]}
                >
                  {statusLabel(it.status)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ))}

      <RegulatoryFooter />
    </Page>
  );
}

/* ─── 5. Valuation & ask ────────────────────────────────────────────────── */

function ValuationAskPage({ data }: { data: InvestorPackData }) {
  const { valuation, ask } = data;
  return (
    <Page size="A4" style={s.page}>
      <HeaderBar />
      <Text style={s.h1}>Valuation range & ask</Text>
      <Text style={s.h1Sub}>Blended AUD range with the founder&apos;s current ask</Text>

      <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
        <View style={s.statTile}>
          <Text style={s.label}>Low</Text>
          <Text style={s.statValue}>{formatAud(valuation.lowAud)}</Text>
        </View>
        <View style={s.statTile}>
          <Text style={s.label}>Mid</Text>
          <Text style={[s.statValue, { color: C.brand700 }]}>
            {formatAud(valuation.midAud)}
          </Text>
        </View>
        <View style={s.statTile}>
          <Text style={s.label}>High</Text>
          <Text style={s.statValue}>{formatAud(valuation.highAud)}</Text>
        </View>
      </View>

      <Text style={s.bodyPara}>
        <Text style={{ fontFamily: "Helvetica-Bold" }}>Method: </Text>
        {valuation.method}. Ranges are indicative pre-money in AUD and blend a
        Berkus / Scorecard / Revenue-multiple model calibrated against 2024–2025
        AU raises.
      </Text>

      <Text style={s.h2}>The ask</Text>
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
        <View style={s.statTile}>
          <Text style={s.label}>Raise amount</Text>
          <Text style={s.statValue}>
            {ask.raiseAmountAud > 0 ? formatAud(ask.raiseAmountAud) : "—"}
          </Text>
          <Text style={s.statSub}>
            {ask.raiseAmountAud > 0
              ? "Founder-nominated"
              : "Add a raise amount in the workspace"}
          </Text>
        </View>
        <View style={[s.statTile, { flex: 2 }]}>
          <Text style={s.label}>Use of funds</Text>
          <Text
            style={{
              fontSize: 9.5,
              color: C.ink700,
              marginTop: 4,
              lineHeight: 1.55,
            }}
          >
            {ask.useOfFunds}
          </Text>
        </View>
      </View>

      <RegulatoryFooter />
    </Page>
  );
}

/* ─── 6. AU comparables ─────────────────────────────────────────────────── */

function ComparablesPage({ data }: { data: InvestorPackData }) {
  const rows = data.comparables;
  return (
    <Page size="A4" style={s.page}>
      <HeaderBar />
      <Text style={s.h1}>AU comparable raises</Text>
      <Text style={s.h1Sub}>Sector- and stage-matched, from public reporting</Text>

      {rows.length === 0 && (
        <Placeholder label="No sector- and stage-matched comparables surfaced. Try broadening sector or updating your stage in the workspace." />
      )}

      {rows.length > 0 && (
        <View style={{ borderWidth: 0.5, borderColor: C.surface200, borderRadius: 4 }}>
          <View style={s.tableHeader}>
            <Text style={[s.tableHeaderCell, { width: "26%" }]}>Company</Text>
            <Text style={[s.tableHeaderCell, { width: "16%" }]}>Sector</Text>
            <Text style={[s.tableHeaderCell, { width: "12%" }]}>Stage</Text>
            <Text style={[s.tableHeaderCell, { width: "8%", textAlign: "right" }]}>
              Year
            </Text>
            <Text style={[s.tableHeaderCell, { width: "16%", textAlign: "right" }]}>
              Round
            </Text>
            <Text style={[s.tableHeaderCell, { width: "22%" }]}>Lead</Text>
          </View>
          {rows.map((row, i) => (
            <View
              key={`${row.company}-${i}`}
              style={[
                s.tableRow,
                { backgroundColor: i % 2 === 0 ? C.white : C.surface50 },
              ]}
            >
              <Text
                style={[
                  s.tableCell,
                  { width: "26%", fontFamily: "Helvetica-Bold", color: C.ink800 },
                ]}
              >
                {row.company}
              </Text>
              <Text style={[s.tableCell, { width: "16%", color: C.ink600 }]}>
                {row.sector}
              </Text>
              <Text style={[s.tableCell, { width: "12%", color: C.ink600 }]}>
                {prettyStage(row.stage)}
              </Text>
              <Text style={[s.tableCell, { width: "8%", textAlign: "right" }]}>
                {row.year}
              </Text>
              <Text
                style={[
                  s.tableCell,
                  {
                    width: "16%",
                    textAlign: "right",
                    fontFamily: "Helvetica-Bold",
                    color: C.brand700,
                  },
                ]}
              >
                {formatAud(row.roundAud)}
              </Text>
              <Text style={[s.tableCell, { width: "22%", color: C.ink600 }]}>
                {row.leadInvestor ?? "—"}
              </Text>
            </View>
          ))}
        </View>
      )}

      <Text
        style={{
          marginTop: 10,
          fontSize: 8,
          color: C.ink500,
          fontStyle: "italic",
          lineHeight: 1.4,
        }}
      >
        Round figures are AUD, rounded to the nearest published number.
        Comparables are for context only and are not a valuation opinion.
      </Text>

      <RegulatoryFooter />
    </Page>
  );
}

/* ─── 7. Team + cap-table ───────────────────────────────────────────────── */

function TeamAndCapPage({ data }: { data: InvestorPackData }) {
  const { team, capTable } = data;
  return (
    <Page size="A4" style={s.page}>
      <HeaderBar />
      <Text style={s.h1}>Team & cap table</Text>
      <Text style={s.h1Sub}>Snapshots pulled from the founder&apos;s workspace</Text>

      <Text style={s.h2}>Team</Text>
      {team.length === 0 && (
        <Placeholder label="Not yet on file — add founder + co-founders in the workspace to populate this snapshot." />
      )}
      {team.length > 0 && (
        <View style={{ borderWidth: 0.5, borderColor: C.surface200, borderRadius: 4 }}>
          <View style={s.tableHeader}>
            <Text style={[s.tableHeaderCell, { width: "55%" }]}>Name</Text>
            <Text style={[s.tableHeaderCell, { width: "45%" }]}>Role</Text>
          </View>
          {team.map((m, i) => (
            <View
              key={`${m.name}-${i}`}
              style={[
                s.tableRow,
                { backgroundColor: i % 2 === 0 ? C.white : C.surface50 },
              ]}
            >
              <Text
                style={[
                  s.tableCell,
                  { width: "55%", fontFamily: "Helvetica-Bold", color: C.ink800 },
                ]}
              >
                {m.name}
              </Text>
              <Text style={[s.tableCell, { width: "45%", color: C.ink600 }]}>
                {m.role}
              </Text>
            </View>
          ))}
        </View>
      )}

      <Text style={s.h2}>Cap table (fully diluted)</Text>
      {capTable.length === 0 && (
        <Placeholder label="Not yet on file — build a cap table in the workspace so this snapshot appears." />
      )}
      {capTable.length > 0 && (
        <View style={{ borderWidth: 0.5, borderColor: C.surface200, borderRadius: 4 }}>
          <View style={s.tableHeader}>
            <Text style={[s.tableHeaderCell, { width: "70%" }]}>Holder</Text>
            <Text style={[s.tableHeaderCell, { width: "30%", textAlign: "right" }]}>
              % fully diluted
            </Text>
          </View>
          {capTable.map((row, i) => (
            <View
              key={`${row.holder}-${i}`}
              style={[
                s.tableRow,
                { backgroundColor: i % 2 === 0 ? C.white : C.surface50 },
              ]}
            >
              <Text
                style={[
                  s.tableCell,
                  { width: "70%", fontFamily: "Helvetica-Bold", color: C.ink800 },
                ]}
              >
                {row.holder}
              </Text>
              <Text
                style={[
                  s.tableCell,
                  {
                    width: "30%",
                    textAlign: "right",
                    fontFamily: "Helvetica-Bold",
                    color: C.brand700,
                  },
                ]}
              >
                {row.pctFullyDiluted.toFixed(2)}%
              </Text>
            </View>
          ))}
        </View>
      )}

      <RegulatoryFooter />
    </Page>
  );
}

/* ─── 8. Contact + AFSL disclaimer ──────────────────────────────────────── */

function ContactPage({ data }: { data: InvestorPackData }) {
  const { contact, project } = data;
  return (
    <Page size="A4" style={s.page}>
      <HeaderBar />
      <Text style={s.h1}>Contact & disclaimer</Text>
      <Text style={s.h1Sub}>Talk to the founder · statutory disclaimer</Text>

      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
        <View style={s.statTile}>
          <Text style={s.label}>Founder</Text>
          <Text style={[s.statValue, { fontSize: 13 }]}>
            {contact.founderName || "—"}
          </Text>
          <Text style={s.statSub}>{project.name}</Text>
        </View>
        <View style={s.statTile}>
          <Text style={s.label}>Email</Text>
          <Text style={[s.statValue, { fontSize: 13, color: C.brand700 }]}>
            {contact.email || "—"}
          </Text>
          <Text style={s.statSub}>Prefer direct outreach</Text>
        </View>
        <View style={s.statTile}>
          <Text style={s.label}>Website</Text>
          <Text style={[s.statValue, { fontSize: 13 }]}>
            {contact.website ?? "—"}
          </Text>
          <Text style={s.statSub}>
            {contact.website ? "See the live product" : "Not yet on file"}
          </Text>
        </View>
      </View>

      <View
        style={{
          padding: 12,
          borderWidth: 0.5,
          borderColor: C.surface200,
          borderRadius: 6,
          backgroundColor: C.surface50,
        }}
      >
        <Text
          style={{
            fontSize: 9,
            fontFamily: "Helvetica-Bold",
            color: C.ink800,
            marginBottom: 4,
          }}
        >
          Statutory disclaimer
        </Text>
        <Text style={{ fontSize: 9, color: C.ink700, lineHeight: 1.55 }}>
          General information only. Not financial advice. Comparables are drawn
          from public reporting; ranges and grades are indicative and are not a
          valuation opinion nor an offer of securities. Recipients should seek
          independent legal, tax and financial advice before making any
          investment decision. Prepared by {AUSCHAIN_LINE}.
        </Text>
      </View>

      <Text
        style={{
          marginTop: 14,
          fontSize: 8,
          color: C.ink500,
          fontStyle: "italic",
          textAlign: "center",
          lineHeight: 1.5,
        }}
      >
        Built on BlockID.au — the Australian startup viability index.
      </Text>

      <RegulatoryFooter />
    </Page>
  );
}

/* ─── Top-level document ────────────────────────────────────────────────── */

export function InvestorPackPDF({ data }: { data: InvestorPackData }) {
  return (
    <Document
      title={`Investor Pack — ${data.project.name}`}
      author="BlockID.au"
      creator="BlockID.au Investor Pack"
      producer="Auschain PTY LTD"
      subject="Startup investor pack"
    >
      <CoverPage data={data} />
      <SummaryPage data={data} />
      <DimensionsPage data={data} />
      <ChecklistPage data={data} />
      <ValuationAskPage data={data} />
      <ComparablesPage data={data} />
      <TeamAndCapPage data={data} />
      <ContactPage data={data} />
    </Document>
  );
}

export default InvestorPackPDF;
