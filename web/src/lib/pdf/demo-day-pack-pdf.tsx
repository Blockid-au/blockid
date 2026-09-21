// Demo-day pack PDF (G21 P2-C, 2026-09-20) — one compact page per selected
// startup: the Assessment Card (lib/pdf/assessment-card-pdf.tsx, the same
// block the TBR and the IC memo print) + top strengths / top gaps + the
// BlockID Dossier and live-profile links. A cover page opens the pack.
//
// Served by GET /api/reports/demo-day-pack?batch=<id> for the batch's
// selected startups (shortlisted or a submitted "proceed"). Page budget:
// 1 + n pages — the colocated test pins it. Helvetica only (English pack;
// Vietnamese names go through pdfSafeText's diacritic stripping).

import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { HELVETICA } from "@/lib/pdf/fonts";
import { LEGAL_ENTITY } from "@/lib/site/legal-entity";
import { INK } from "@/lib/report-visuals";
import { pdfSafeText as t } from "@/lib/report-visuals/pdf-text";
import type { AssessmentCardData } from "@/lib/svi/assessment-card";
import { AssessmentCardPdf } from "./assessment-card-pdf";
import { AdviceDisclaimer, PDF_ENTITY_LINE } from "./advice-disclaimer";
import { pdfPageCount } from "./page-count";
import { PDF_THEME } from "./theme";

export const DEMO_DAY_PACK_FOOTER = `Prepared with BlockID.au · ${LEGAL_ENTITY.operator} · not financial advice`;
export const DEMO_DAY_PACK_TITLE = "BlockID Demo-day pack";
export const DEMO_DAY_HUMAN_LINE = "BlockID structures the evidence and standardises the first-pass analysis. Humans make the decision.";

const C = { ink: INK.text, muted: INK.muted, faint: INK.faint, grid: INK.grid, surface: INK.surfaceAlt, brand: PDF_THEME.navy };
const MM = 72 / 25.4;
const MARGIN = 16 * MM;

const s = StyleSheet.create({
  page: { paddingTop: MARGIN, paddingBottom: MARGIN + 12, paddingHorizontal: MARGIN, fontFamily: "Helvetica", fontSize: 9, color: C.ink },
  footer: { position: "absolute", left: MARGIN, right: MARGIN, bottom: 20, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: C.faint },
  kicker: { fontSize: 7.5, letterSpacing: 1.2, textTransform: "uppercase", color: C.brand, fontFamily: "Helvetica-Bold" },
  h1: { fontSize: 18, fontFamily: "Helvetica-Bold", marginTop: 2 },
  h2: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 8, marginBottom: 4 },
  h3: { fontSize: 9.5, fontFamily: "Helvetica-Bold", marginTop: 6, marginBottom: 2 },
  body: { fontSize: 9, lineHeight: 1.4 },
  small: { fontSize: 7.5, color: C.muted, lineHeight: 1.35 },
  tiny: { fontSize: 7, color: C.faint },
  row: { flexDirection: "row", marginTop: 4 },
  col: { flex: 1, marginRight: 8 },
  softBox: { backgroundColor: C.surface, borderRadius: 4, padding: 7, marginTop: 6 },
  toc: { marginTop: 8 },
  tocRow: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 0.5, borderBottomColor: C.grid, paddingVertical: 3 },
});

export interface DemoDayPackEntry {
  card: AssessmentCardData;
  strengths: string[];
  gaps: string[];
  dossierUrl: string;
  profileUrl: string | null;
}

export interface DemoDayPackProps {
  cohortName: string;
  programName: string | null;
  generatedAt: string;
  entries: DemoDayPackEntry[];
  /** Absolute site base for the links printed on each page. */
  base?: string;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "Australia/Sydney" });
}

function Footer({ cohort }: { cohort: string }) {
  return (
    <View style={s.footer} fixed>
      <Text>{t(`${DEMO_DAY_PACK_FOOTER} · ${cohort}`)}</Text>
      <Text render={({ pageNumber, totalPages }) => `page ${pageNumber}/${totalPages}`} />
    </View>
  );
}

export function DemoDayPackPdf({ cohortName, programName, generatedAt, entries, base = "https://blockid.au" }: DemoDayPackProps) {
  return (
    <Document title={`${DEMO_DAY_PACK_TITLE} — ${cohortName}`} author="BlockID.au" subject="Demo-day pack" creator="BlockID.au">
      <Page size="A4" style={s.page}>
        <Text style={s.kicker}>{t(DEMO_DAY_PACK_TITLE)}</Text>
        <Text style={s.h1}>{t(cohortName)}</Text>
        {programName ? <Text style={s.body}>{t(`Prepared by ${programName}`)}</Text> : null}
        <Text style={s.small}>{t(`Generated ${fmtDate(generatedAt)} · ${entries.length} selected startup${entries.length === 1 ? "" : "s"} · one page each: Assessment Card, top strengths, top gaps, dossier link`)}</Text>
        <View style={s.softBox}>
          <Text style={s.body}>{t(DEMO_DAY_HUMAN_LINE)}</Text>
        </View>
        <View style={s.toc}>
          <Text style={s.h3}>In this pack</Text>
          {entries.length === 0 ? <Text style={s.small}>No selected startup yet — shortlist or record a proceed decision on the cohort table.</Text> : null}
          {entries.map((e, i) => (
            <View key={`${e.card.startupName}-${i}`} style={s.tocRow}>
              <Text style={s.body}>{t(`${i + 1}. ${e.card.startupName}`)}</Text>
              <Text style={s.small}>{t(`SVI ${e.card.svi === null ? "—" : e.card.svi} · confidence ${e.card.evidenceConfidence} % · ${e.card.verification.label}`)}</Text>
            </View>
          ))}
        </View>
        <AdviceDisclaimer variant="general" />
        <Text style={[s.tiny, { marginTop: 3 }]}>{t(PDF_ENTITY_LINE)}</Text>
        <Footer cohort={cohortName} />
      </Page>
      {entries.map((e, i) => (
        <Page key={`${e.card.startupName}-${i}`} size="A4" style={s.page}>
          <Text style={s.kicker}>{t(`${DEMO_DAY_PACK_TITLE} · ${cohortName} · ${i + 1} of ${entries.length}`)}</Text>
          <Text style={s.h1}>{t(e.card.startupName)}</Text>
          <View style={{ marginTop: 6 }}>
            <AssessmentCardPdf data={e.card} font={HELVETICA} />
          </View>
          <View style={s.row}>
            <View style={s.col}>
              <Text style={s.h3}>Top strengths</Text>
              {e.strengths.length === 0 ? <Text style={s.small}>Nothing evidenced yet.</Text> : e.strengths.map((x) => <Text key={x} style={s.body}>{t(`• ${x}`)}</Text>)}
            </View>
            <View style={s.col}>
              <Text style={s.h3}>Top gaps</Text>
              {e.gaps.length === 0 ? <Text style={s.small}>No gap flagged.</Text> : e.gaps.map((x) => <Text key={x} style={s.body}>{t(`• ${x}`)}</Text>)}
            </View>
          </View>
          <View style={s.softBox}>
            <Text style={s.small}>{t(`BlockID Dossier: ${base}${e.dossierUrl}`)}</Text>
            {e.profileUrl ? <Text style={s.small}>{t(`Live profile: ${base}${e.profileUrl}`)}</Text> : null}
          </View>
          <Footer cohort={cohortName} />
        </Page>
      ))}
    </Document>
  );
}

export interface RenderDemoDayPackResult {
  buffer: Buffer;
  pages: number;
}

export async function renderDemoDayPackPdf(props: DemoDayPackProps): Promise<RenderDemoDayPackResult> {
  const buffer = await renderToBuffer(<DemoDayPackPdf {...props} />);
  return { buffer: Buffer.from(buffer), pages: pdfPageCount(buffer) };
}
