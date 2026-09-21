// G21-P1-B — the compact Assessment Card block for the react-pdf twins
// (Trusted Business Report + IC memo). Renders the same `AssessmentCardData`
// the web card and the DOCX twin use; fonts are passed in because each twin
// swaps its font set per locale (HELVETICA / Noto for VI).

import { StyleSheet, Text, View } from "@react-pdf/renderer";
import { BAND_COLOUR, INK } from "@/lib/report-visuals";
import { pdfSafeText } from "@/lib/report-visuals/pdf-text";
import type { AssessmentCardData } from "@/lib/svi/assessment-card";
import type { PdfFontSet } from "@/lib/pdf/fonts";

const BRAND = "#0072B2";

/** Plain-text lines for the DOCX twin and the PDF block alike (label · value). */
export function assessmentCardLines(data: AssessmentCardData): Array<{ label: string; value: string }> {
  const lines: Array<{ label: string; value: string }> = [
    { label: "Verification", value: `${data.verification.label} · ${data.verification.tier}` },
    { label: "Stage", value: data.stageLabel },
    { label: "Sector", value: data.sector },
  ];
  if (data.benchmark) lines.push({ label: "Benchmark", value: `${data.benchmark.segment ? `${data.benchmark.segment} median` : "stage median"} ${data.benchmark.median} (n = ${data.benchmark.n}) · ${data.benchmark.label}` });
  lines.push({ label: "Top strength", value: data.topStrength ? `${data.topStrength.dim.toUpperCase()} ${data.topStrength.title} ${data.topStrength.score}` : "—" });
  lines.push({ label: "Top gap", value: data.topGap ? `${data.topGap.dim.toUpperCase()} ${data.topGap.title} ${data.topGap.score}` : "—" });
  lines.push({ label: "Unverified material claims", value: String(data.unverifiedMaterialClaims) });
  lines.push({ label: "Last updated", value: formatIsoDate(data.lastUpdated) });
  lines.push({ label: "Methodology", value: `SVI v${data.methodologyVersion}` });
  if (data.pendingDims > 0) lines.push({ label: "Pending", value: `${data.pendingDims} of 8 dimensions pending` });
  return lines;
}

export function formatIsoDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export const ASSESSMENT_CARD_PDF_TITLE = "BlockID Assessment Card";

/** One line for the slim (free-tier, high trim level) form: "SVI 74 / 100 · Evidence Confidence 55 % · BlockID Verified L2 · …". */
export function assessmentCardSummaryLine(data: AssessmentCardData): string {
  const parts = [
    `SVI ${data.svi === null ? "—" : `${data.svi} / 100`}`,
    `Evidence Confidence ${data.evidenceConfidence} %`,
    data.verification.label,
    data.topStrength ? `Top strength ${data.topStrength.dim.toUpperCase()} ${data.topStrength.score}` : null,
    data.topGap ? `Top gap ${data.topGap.dim.toUpperCase()} ${data.topGap.score}` : null,
    `Unverified material claims ${data.unverifiedMaterialClaims}`,
  ];
  return parts.filter(Boolean).join(" · ");
}

export function AssessmentCardPdf({ data, font, unicode = false, marginBottom = 8, slim = false }: { data: AssessmentCardData; font: PdfFontSet; unicode?: boolean; marginBottom?: number; /** Free tier at a high trim level: two lines instead of the tile block (page budget). */ slim?: boolean }) {
  const t = (v: unknown) => pdfSafeText(v, { unicode });
  const bold = font.boldWeight === undefined ? { fontFamily: font.bold } : { fontFamily: font.bold, fontWeight: font.boldWeight };
  if (slim) {
    return (
      <View style={{ backgroundColor: INK.surfaceAlt, borderRadius: 3, padding: 5, marginBottom, fontFamily: font.regular }} wrap={false}>
        <Text style={{ fontSize: 6.5, letterSpacing: 0.8, textTransform: "uppercase", color: BRAND, ...bold }}>{t(ASSESSMENT_CARD_PDF_TITLE)}</Text>
        <Text style={{ fontSize: 7.5, color: INK.text, lineHeight: 1.3 }}>{t(assessmentCardSummaryLine(data))}</Text>
      </View>
    );
  }
  const st = StyleSheet.create({
    box: { borderWidth: 1, borderColor: INK.grid, borderRadius: 4, padding: 8, marginBottom, fontFamily: font.regular },
    kicker: { fontSize: 7, letterSpacing: 1, textTransform: "uppercase", color: BRAND, ...bold },
    name: { fontSize: 11, color: INK.text, marginTop: 1, ...bold },
    row: { flexDirection: "row", marginTop: 5 },
    tile: { flex: 1, backgroundColor: INK.surfaceAlt, borderRadius: 3, padding: 6, marginRight: 6 },
    tileLabel: { fontSize: 6.5, color: INK.muted, textTransform: "uppercase", letterSpacing: 0.5, ...bold },
    tileValue: { fontSize: 18, color: INK.text, ...bold },
    tileSub: { fontSize: 7.5, color: INK.muted },
    grid: { flexDirection: "row", flexWrap: "wrap", marginTop: 5 },
    cell: { width: "33.33%", paddingRight: 6, marginBottom: 3 },
    label: { fontSize: 6.5, color: INK.muted, textTransform: "uppercase", letterSpacing: 0.5, ...bold },
    value: { fontSize: 8, color: INK.text, lineHeight: 1.3 },
  });
  const lines = assessmentCardLines(data);
  return (
    <View style={st.box} wrap={false}>
      <Text style={st.kicker}>{t(ASSESSMENT_CARD_PDF_TITLE)}</Text>
      <Text style={st.name}>{t(data.startupName)}</Text>
      <View style={st.row}>
        <View style={st.tile}>
          <Text style={st.tileLabel}>SVI</Text>
          <Text style={[st.tileValue, { color: data.svi === null ? INK.muted : BAND_COLOUR[data.sviBand] }]}>{data.svi === null ? "—" : `${data.svi} / 100`}</Text>
          <Text style={st.tileSub}>{t(data.sviBand === "pending" ? "Pending" : data.sviBand)}</Text>
        </View>
        <View style={[st.tile, { marginRight: 0 }]}>
          <Text style={st.tileLabel}>Evidence Confidence</Text>
          <Text style={st.tileValue}>{`${data.evidenceConfidence} %`}</Text>
          <Text style={st.tileSub}>{t(data.verification.label)}</Text>
        </View>
      </View>
      <View style={st.grid}>
        {lines.map((l) => (
          <View key={l.label} style={st.cell}>
            <Text style={st.label}>{t(l.label)}</Text>
            <Text style={st.value}>{t(l.value)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
