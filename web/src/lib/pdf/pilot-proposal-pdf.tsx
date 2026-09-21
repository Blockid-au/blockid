// Cohort Validation Pilot proposal PDF (G23-B, 2026-09-21) — the advisor plan's
// Level 3 artefact ("a written pilot proposal with scope, price and dates sent
// to a named organisation"), rendered on demand from the validation tracker
// (GET /api/admin/validation/[id]/proposal) on the cohort-report-pdf.tsx
// pattern: built-in Helvetica, A4, footer with the operator + "not financial
// advice" + page x/y, page count read back from the bytes.
//
// Page 1  cover · the problem in their words · scope and price · includes
// Page 2  what is delivered — the six stages that ship today
// Page 3  success metrics · timeline · data and consent
// Page 4  after the pilot (Cohort 25 / Cohort 100 annual, the credit rule) ·
//         acceptance + signature block · entity / ABN footer · disclaimer
//
// Every string comes from `buildPilotProposal()` (lib/validation/proposal.ts);
// nothing here carries an amount, a cap or an entity literal. The suite pins
// ≤ PILOT_PROPOSAL_MAX_PAGES pages and ≤ PILOT_PROPOSAL_MAX_BYTES bytes.

import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { LEGAL_ENTITY } from "@/lib/site/legal-entity";
import { INK } from "@/lib/report-visuals";
import { pdfSafeText as t } from "@/lib/report-visuals/pdf-text";
import type { PilotProposal } from "@/lib/validation/proposal";
import { AdviceDisclaimer } from "./advice-disclaimer";
import { pdfPageCount } from "./page-count";
import { PDF_THEME } from "./theme";

export const PILOT_PROPOSAL_FOOTER = `Prepared with BlockID.au · ${LEGAL_ENTITY.operator} · not financial advice`;
export const PILOT_PROPOSAL_MAX_PAGES = 4;
/** Text-only document on the built-in font — well under this. */
export const PILOT_PROPOSAL_MAX_BYTES = 120 * 1024;

const C = { ink: INK.text, muted: INK.muted, faint: INK.faint, grid: INK.grid, surface: INK.surfaceAlt, brand: PDF_THEME.navy };
const MM = 72 / 25.4;
const MARGIN = 16 * MM;

const s = StyleSheet.create({
  page: { paddingTop: MARGIN, paddingBottom: MARGIN + 12, paddingHorizontal: MARGIN, fontFamily: "Helvetica", fontSize: 9, color: C.ink },
  footer: { position: "absolute", left: MARGIN, right: MARGIN, bottom: 20, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: C.faint },
  kicker: { fontSize: 7.5, letterSpacing: 1.2, textTransform: "uppercase", color: C.brand, fontFamily: "Helvetica-Bold" },
  h1: { fontSize: 20, fontFamily: "Helvetica-Bold", marginTop: 4 },
  h2: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 12, marginBottom: 4, borderBottomWidth: 1, borderBottomColor: C.grid, paddingBottom: 3 },
  h3: { fontSize: 9.5, fontFamily: "Helvetica-Bold", marginTop: 6, marginBottom: 2 },
  body: { fontSize: 9, lineHeight: 1.4 },
  small: { fontSize: 7.5, color: C.muted, lineHeight: 1.35 },
  tiny: { fontSize: 7, color: C.faint },
  bold: { fontFamily: "Helvetica-Bold" },
  row: { flexDirection: "row" },
  coverMeta: { marginTop: 10, borderTopWidth: 1, borderTopColor: C.grid, paddingTop: 6, flexDirection: "row", flexWrap: "wrap" },
  metaCell: { width: "50%", marginBottom: 4 },
  metaK: { fontSize: 6.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 },
  quote: { backgroundColor: C.surface, borderLeftWidth: 3, borderLeftColor: C.brand, padding: 8, marginTop: 4, marginBottom: 4 },
  quoteText: { fontSize: 10, fontFamily: "Helvetica-Oblique", lineHeight: 1.45 },
  tiles: { flexDirection: "row", marginTop: 6, marginBottom: 6 },
  tile: { flex: 1, borderWidth: 1, borderColor: C.grid, borderRadius: 4, padding: 6, marginRight: 6 },
  tileV: { fontSize: 15, fontFamily: "Helvetica-Bold" },
  tileL: { fontSize: 7, color: C.muted },
  cols: { flexDirection: "row" },
  col: { flex: 1, marginRight: 8 },
  bullet: { fontSize: 8.5, lineHeight: 1.4, marginBottom: 2 },
  stage: { borderWidth: 1, borderColor: C.grid, borderRadius: 4, padding: 6, marginBottom: 5 },
  stageHead: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  table: { borderWidth: 1, borderColor: C.grid, borderRadius: 3, marginBottom: 6 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.grid },
  head: { backgroundColor: C.surface, fontFamily: "Helvetica-Bold" },
  cell: { fontSize: 8, padding: 3 },
  softBox: { backgroundColor: C.surface, borderRadius: 4, padding: 7, marginBottom: 6 },
  sig: { borderWidth: 1, borderColor: C.grid, borderRadius: 4, padding: 8, marginTop: 8, flexDirection: "row", flexWrap: "wrap" },
  sigCell: { width: "50%", marginBottom: 10 },
  sigLine: { borderBottomWidth: 0.7, borderBottomColor: C.ink, height: 14, marginRight: 16 },
  sigK: { fontSize: 6.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 },
});

function Footer({ reference }: { reference: string }) {
  return (
    <View style={s.footer} fixed>
      <Text>{t(`${PILOT_PROPOSAL_FOOTER} · ${reference}`)}</Text>
      <Text render={({ pageNumber, totalPages }) => `page ${pageNumber}/${totalPages}`} />
    </View>
  );
}

function Tile({ v, l }: { v: string; l: string }) {
  return (
    <View style={s.tile}>
      <Text style={s.tileV}>{t(v)}</Text>
      <Text style={s.tileL}>{t(l)}</Text>
    </View>
  );
}

function Bullets({ items }: { items: readonly string[] }) {
  return (
    <View>
      {items.map((x) => (
        <Text key={x} style={s.bullet}>
          {t(`• ${x}`)}
        </Text>
      ))}
    </View>
  );
}

// Page 1 — the cover, the buyer's own words, scope and price.
function CoverPage({ p }: { p: PilotProposal }) {
  const half = Math.ceil(p.scope.includes.length / 2);
  return (
    <Page size="A4" style={s.page}>
      <Text style={s.kicker}>{t(`${p.cover.brand} · ${p.meta.reference}`)}</Text>
      <Text style={s.h1}>{t(p.cover.title)}</Text>
      <Text style={[s.body, { fontSize: 12, marginTop: 4 }]}>{t(`Prepared for ${p.cover.organisation}`)}</Text>
      <View style={s.coverMeta}>
        <View style={s.metaCell}>
          <Text style={s.metaK}>Organisation</Text>
          <Text style={s.body}>{t(p.cover.organisation)}</Text>
        </View>
        <View style={s.metaCell}>
          <Text style={s.metaK}>Contact role</Text>
          <Text style={s.body}>{t(p.cover.contactRole || "—")}</Text>
        </View>
        <View style={s.metaCell}>
          <Text style={s.metaK}>Date</Text>
          <Text style={s.body}>{t(p.cover.dateLabel)}</Text>
        </View>
        <View style={s.metaCell}>
          <Text style={s.metaK}>Valid until</Text>
          <Text style={s.body}>{t(p.cover.validUntilLabel)}</Text>
        </View>
        <View style={[s.metaCell, { width: "100%" }]}>
          <Text style={s.metaK}>Prepared by</Text>
          <Text style={s.body}>{t(`${p.cover.preparedBy} — ${p.cover.preparedByRole}`)}</Text>
        </View>
      </View>

      <Text style={s.h2}>{t(p.problem.heading)}</Text>
      <Text style={s.small}>{t(p.problem.lead)}</Text>
      {p.problem.quote ? (
        <View style={s.quote}>
          <Text style={s.quoteText}>{t(`“${p.problem.quote}”`)}</Text>
        </View>
      ) : (
        <Text style={s.body}>No objection was recorded — the scope below answers the intake problem every program described to us: different formats, different judgement, different feedback.</Text>
      )}
      {p.problem.note ? <Text style={s.small}>{t(p.problem.note)}</Text> : null}

      <Text style={s.h2}>{t(p.scope.heading)}</Text>
      <Text style={[s.body, s.bold]}>{t(p.scope.name)}</Text>
      <View style={s.tiles}>
        <Tile v={p.scope.priceLabel} l="One-off, inc. GST" />
        <Tile v={String(p.scope.applicantsCap)} l="Applicants covered" />
        <Tile v={`${p.scope.accessDays} days`} l="Workspace access from payment" />
      </View>
      {p.scope.lines.map((line) => (
        <Text key={line} style={[s.body, { marginBottom: 2 }]}>
          {t(line)}
        </Text>
      ))}
      <Text style={s.h3}>What the pilot includes</Text>
      <View style={s.cols}>
        <View style={s.col}>
          <Bullets items={p.scope.includes.slice(0, half)} />
        </View>
        <View style={s.col}>
          <Bullets items={p.scope.includes.slice(half)} />
        </View>
      </View>
      <Footer reference={p.meta.reference} />
    </Page>
  );
}

// Page 2 — what is delivered: the six stages that ship today.
function DeliveredPage({ p }: { p: PilotProposal }) {
  return (
    <Page size="A4" style={s.page}>
      <Text style={s.kicker}>What is delivered</Text>
      <Text style={[s.h2, { marginTop: 4 }]}>{t(p.delivered.heading)}</Text>
      <Text style={s.small}>{t(p.delivered.lede)}</Text>
      {p.delivered.stages.map((st) => (
        <View key={st.n} style={s.stage} wrap={false}>
          <View style={s.stageHead}>
            <Text style={[s.body, s.bold]}>{t(`${st.n}. ${st.headline}`)}</Text>
            <Text style={s.tiny}>{t(st.window)}</Text>
          </View>
          <Bullets items={st.bullets} />
        </View>
      ))}
      <Footer reference={p.meta.reference} />
    </Page>
  );
}

// Page 3 — success metrics, timeline, data and consent (the program's applicants keep their data).
function MetricsPage({ p }: { p: PilotProposal }) {
  return (
    <Page size="A4" style={s.page}>
      <Text style={s.kicker}>How we measure the pilot</Text>
      <Text style={[s.h2, { marginTop: 4 }]}>{t(p.metrics.heading)}</Text>
      <Text style={s.small}>{t(p.metrics.lede)}</Text>
      <View style={{ marginTop: 4 }}>
        <Bullets items={p.metrics.items} />
      </View>

      <Text style={s.h2}>{t(p.timeline.heading)}</Text>
      <View style={s.table}>
        {p.timeline.steps.map((step, i) => (
          <View key={step.label} style={s.tr} wrap={false}>
            <Text style={[s.cell, s.bold, { width: "22%" }]}>{t(`${i + 1}. ${step.label}`)}</Text>
            <Text style={[s.cell, { width: "78%" }]}>{t(step.detail)}</Text>
          </View>
        ))}
      </View>
      <Text style={s.small}>{t(p.timeline.accessLine)}</Text>

      <Text style={s.h2}>{t(p.data.heading)}</Text>
      <View style={s.softBox}>
        <Text style={[s.body, s.bold]}>{t(p.data.principle)}</Text>
      </View>
      <Text style={s.h3}>What every applicant reads before submitting</Text>
      <View style={s.quote}>
        <Text style={s.body}>{t(p.data.consent)}</Text>
      </View>
      <Text style={s.small}>{t(`Checkbox label: “${p.data.consentLabel}”`)}</Text>
      <Text style={s.h3}>Retention</Text>
      <Text style={s.body}>{t(p.data.retention)}</Text>
      <Footer reference={p.meta.reference} />
    </Page>
  );
}

// Page 4 — after the pilot, acceptance + signature, entity footer, disclaimer.
function AcceptancePage({ p }: { p: PilotProposal }) {
  return (
    <Page size="A4" style={s.page}>
      <Text style={s.kicker}>{t(p.after.heading)}</Text>
      <Text style={[s.h2, { marginTop: 4 }]}>{t(p.after.heading)}</Text>
      <Text style={s.body}>{t(p.after.lede)}</Text>
      <View style={[s.table, { marginTop: 6 }]}>
        <View style={[s.tr, s.head]}>
          <Text style={[s.cell, s.bold, { width: "28%" }]}>Plan</Text>
          <Text style={[s.cell, s.bold, { width: "44%" }]}>For</Text>
          <Text style={[s.cell, s.bold, { width: "28%", textAlign: "right" }]}>Annual, inc. GST</Text>
        </View>
        {p.after.tiers.map((tier) => (
          <View key={tier.id} style={s.tr} wrap={false}>
            <Text style={[s.cell, { width: "28%" }]}>{t(tier.name)}</Text>
            <Text style={[s.cell, { width: "44%" }]}>{t(tier.tagline)}</Text>
            <Text style={[s.cell, { width: "28%", textAlign: "right" }]}>{t(`${tier.annualLabel} a year`)}</Text>
          </View>
        ))}
      </View>
      <View style={s.softBox}>
        <Text style={[s.body, s.bold]}>{t(p.after.creditRule)}</Text>
      </View>

      <Text style={s.h2}>{t(p.acceptance.heading)}</Text>
      <Text style={s.body}>{t(p.acceptance.text)}</Text>
      <View style={s.sig} wrap={false}>
        {p.acceptance.fields.map((field) => (
          <View key={field} style={s.sigCell}>
            <View style={s.sigLine} />
            <Text style={s.sigK}>{t(field)}</Text>
          </View>
        ))}
        <View style={s.sigCell}>
          <View style={s.sigLine} />
          <Text style={s.sigK}>{t(`For ${p.cover.preparedBy}`)}</Text>
        </View>
      </View>

      <Text style={[s.small, { marginTop: 10 }]}>{t(p.footer.entity)}</Text>
      <AdviceDisclaimer variant="general" />
      <Text style={[s.tiny, { marginTop: 3 }]}>{t(`${p.footer.statutory} · generated ${p.meta.generatedAt.slice(0, 10)} · ${p.meta.reference}`)}</Text>
      <Footer reference={p.meta.reference} />
    </Page>
  );
}

export function PilotProposalPdf({ proposal }: { proposal: PilotProposal }) {
  return (
    <Document title={`${proposal.cover.title} — ${proposal.cover.organisation}`} author="BlockID.au" subject="Cohort Validation Pilot proposal" creator="BlockID.au">
      <CoverPage p={proposal} />
      <DeliveredPage p={proposal} />
      <MetricsPage p={proposal} />
      <AcceptancePage p={proposal} />
    </Document>
  );
}

export interface RenderPilotProposalResult {
  buffer: Buffer;
  pages: number;
}

export async function renderPilotProposalPdf(proposal: PilotProposal): Promise<RenderPilotProposalResult> {
  const buffer = await renderToBuffer(<PilotProposalPdf proposal={proposal} />);
  return { buffer: Buffer.from(buffer), pages: pdfPageCount(buffer) };
}
