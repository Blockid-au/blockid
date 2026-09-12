/**
 * Valuation certificate PDF (S22-A) — the document an investor asks for in
 * due diligence: an A4, 3-page, hash-sealed snapshot of the SVI score and
 * the indicative A$ range, rendered from the payload frozen on
 * `valuation_certificates.payload` (migration 0341).
 *
 *   Page 1  cover — startup, ABN when known, issue date, certificate number,
 *           content fingerprint + verify URL; valuation summary (A$ low / mid /
 *           high, method, method note, connected-revenue line when present,
 *           sector multiple range + source); SVI score.
 *   Page 2  8-dimension table + radar (the SVI report's `RadarChartSVG`,
 *           reused as-is), evidence summary (counts by category / dimension,
 *           last verified), assumptions & limitations.
 *   Page 3  methodology (doctoral sentence verbatim), data principle,
 *           general-advice + not-a-valuation-report disclaimer (APES 225 /
 *           AFSL), signature block for Auschain PTY LTD (ACN / ABN).
 *
 * Every page carries `<HeaderBar>` / `<Footer>` from the SVI report so the
 * certificate reads as the same product, and the S21-A `<WatermarkLayer>`
 * when a recipient is given ("Prepared for <investor> · <date> · BlockID.au")
 * — pass `watermark` from `watermarkLabel()`; null renders clean pages.
 *
 * Nothing here recomputes a figure: the renderer is a pure function of the
 * stored payload so the PDF an investor downloads next year matches the hash
 * on the verify page.
 */

import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { SVIAnalysis } from "@/lib/svi-analysis";
import { C, Footer, HeaderBar, RadarChartSVG, ValuationRangeSVG } from "./svi-report-pdf";
import { WatermarkLayer } from "./watermark";
import { shortFingerprint } from "@/lib/valuation-certificate/hash";
import {
  CERTIFICATE_ASSUMPTIONS,
  CERTIFICATE_DISCLAIMER,
  DATA_PRINCIPLE_SENTENCE,
  DOCTORAL_SENTENCE,
  LEGAL_ENTITY_ABN,
  LEGAL_ENTITY_ACN,
  LEGAL_ENTITY_LINE,
  LEGAL_ENTITY_NAME,
  METHOD_LABELS,
  formatAudCompact,
  formatAudFull,
  type ValuationCertificateData,
} from "@/lib/valuation-certificate/types";

export interface ValuationCertificatePdfProps {
  data: ValuationCertificateData;
  /** `blockid:v1:<hex>` — printed as a 12-char fingerprint + in full on page 3. */
  contentHash: string;
  /** From `watermarkLabel()`; null → clean pages. */
  watermark: string | null;
  /** Set when the certificate has been revoked — a banner is printed on every page. */
  revokedAt?: string | null;
}

const AU_DATE = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Australia/Sydney",
});

export function certificateDate(iso: string): string {
  const d = new Date(iso);
  return AU_DATE.format(Number.isNaN(d.getTime()) ? new Date() : d);
}

const st = StyleSheet.create({
  page: {
    paddingTop: 46,
    paddingBottom: 56,
    paddingHorizontal: 52,
    fontFamily: "Helvetica",
    fontSize: 9,
    color: C.ink800,
    backgroundColor: C.white,
  },
  eyebrow: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: C.brand700,
    marginBottom: 8,
  },
  title: { fontSize: 24, fontFamily: "Helvetica-Bold", color: C.ink900, marginBottom: 4 },
  subtitle: { fontSize: 10, color: C.ink500, marginBottom: 18 },
  h2: { fontSize: 12.5, fontFamily: "Helvetica-Bold", color: C.ink900, marginTop: 10, marginBottom: 5 },
  p: { marginBottom: 6, lineHeight: 1.45 },
  small: { fontSize: 8, color: C.ink500, lineHeight: 1.4 },
  mono: { fontFamily: "Courier", fontSize: 8.5, color: C.ink700 },
  card: {
    borderWidth: 1,
    borderColor: C.surface200,
    borderRadius: 6,
    padding: 10,
    backgroundColor: C.surface50,
    marginBottom: 10,
  },
  hero: {
    borderWidth: 1,
    borderColor: C.brand200,
    borderRadius: 8,
    padding: 14,
    backgroundColor: C.brand50,
    marginBottom: 12,
  },
  row: { flexDirection: "row", gap: 10 },
  kvLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", letterSpacing: 0.8, textTransform: "uppercase", color: C.ink500 },
  kvValue: { fontSize: 10, fontFamily: "Helvetica-Bold", color: C.ink900, marginTop: 2 },
  big: { fontSize: 26, fontFamily: "Helvetica-Bold", color: C.brand700 },
  rangeEnds: { flexDirection: "row", justifyContent: "space-between", marginTop: 2 },
  tr: { flexDirection: "row" },
  th: {
    padding: 5,
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    backgroundColor: C.brand50,
    borderBottomWidth: 1,
    borderBottomColor: C.surface200,
  },
  td: { padding: 5, fontSize: 8.5, borderBottomWidth: 1, borderBottomColor: C.surface200 },
  bulletRow: { flexDirection: "row", marginBottom: 3, paddingLeft: 4 },
  bulletDot: { width: 10, color: C.ink500 },
  bulletText: { flex: 1, lineHeight: 1.35, fontSize: 8.5 },
  disclaimer: {
    marginTop: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: C.amber500,
    backgroundColor: C.amber50,
    borderRadius: 6,
    fontSize: 8,
    color: C.ink700,
    lineHeight: 1.45,
  },
  revoked: {
    position: "absolute",
    top: 10,
    left: 52,
    right: 52,
    padding: 4,
    backgroundColor: C.red100,
    borderRadius: 4,
    textAlign: "center",
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: C.red600,
  },
  signature: {
    marginTop: 18,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: C.surface200,
  },
  sigLine: { width: 220, borderBottomWidth: 1, borderBottomColor: C.ink400, marginTop: 18, marginBottom: 4 },
});

function KV({ label, value, width }: { label: string; value: string; width?: string | number }) {
  return (
    <View style={{ width }}>
      <Text style={st.kvLabel}>{label}</Text>
      <Text style={st.kvValue}>{value}</Text>
    </View>
  );
}

function RevokedBanner({ revokedAt }: { revokedAt?: string | null }) {
  if (!revokedAt) return null;
  return (
    <Text style={st.revoked} fixed>
      REVOKED on {certificateDate(revokedAt)} — this certificate is no longer current. Check the verify link.
    </Text>
  );
}

function Chrome({ watermark, revokedAt }: { watermark: string | null; revokedAt?: string | null }) {
  return (
    <>
      <HeaderBar />
      <WatermarkLayer label={watermark} />
      <RevokedBanner revokedAt={revokedAt} />
    </>
  );
}

/* ── Page 1 — cover + valuation summary ───────────────────────────────── */

function CoverPage({ data, contentHash, watermark, revokedAt }: ValuationCertificatePdfProps) {
  const v = data.valuation;
  const sm = data.sectorMultiple;
  return (
    <Page size="A4" style={st.page}>
      <Chrome watermark={watermark} revokedAt={revokedAt} />
      <Text style={st.eyebrow}>BlockID.au · Startup Value Index · Valuation Certificate</Text>
      <Text style={st.title}>{data.startupName}</Text>
      <Text style={st.subtitle}>
        Indicative valuation certificate for investor due diligence · issued {certificateDate(data.issuedAt)}
        {data.stageLabel ? ` · ${data.stageLabel}` : ""}
      </Text>

      <View style={st.card}>
        <View style={st.row}>
          <KV label="Certificate no." value={data.certificateNo} width="30%" />
          <KV label="ABN" value={data.abn ?? "Not supplied"} width="30%" />
          <KV label="Content fingerprint" value={shortFingerprint(contentHash)} width="40%" />
        </View>
        <View style={{ marginTop: 8 }}>
          <Text style={st.kvLabel}>Verify this certificate</Text>
          <Text style={[st.mono, { marginTop: 2 }]}>{data.verifyUrl}</Text>
          <Text style={[st.small, { marginTop: 3 }]}>
            The verify page shows the issue date, the startup name, whether the stored content still matches this
            fingerprint, and whether the certificate has been revoked. It shows no financial figures.
          </Text>
        </View>
      </View>

      <View style={st.hero}>
        <Text style={st.kvLabel}>Indicative valuation range (AUD)</Text>
        <Text style={st.big}>{formatAudCompact(v.midAud)}</Text>
        <Text style={[st.small, { marginBottom: 6 }]}>
          Midpoint · full range {formatAudFull(v.lowAud)} – {formatAudFull(v.highAud)}
        </Text>
        <ValuationRangeSVG low={v.lowAud} mid={v.midAud} high={v.highAud} width={470} height={30} />
        <View style={st.rangeEnds}>
          <Text style={st.small}>Low {formatAudCompact(v.lowAud)}</Text>
          <Text style={st.small}>Mid {formatAudCompact(v.midAud)}</Text>
          <Text style={st.small}>High {formatAudCompact(v.highAud)}</Text>
        </View>
        <View style={[st.row, { marginTop: 12 }]}>
          <KV label="SVI score" value={String(Math.round(data.sviScore))} width="22%" />
          <KV label="Method" value={METHOD_LABELS[v.method] ?? v.method} width="78%" />
        </View>
        {v.methodNote ? (
          <Text style={[st.small, { marginTop: 6, color: C.amber700 }]}>Method note: {v.methodNote}</Text>
        ) : null}
        {data.connectedRevenue ? (
          <Text style={[st.small, { marginTop: 6 }]}>
            {data.connectedRevenue.label} · ARR {formatAudCompact(data.connectedRevenue.arrAud)} · captured{" "}
            {certificateDate(data.connectedRevenue.capturedAt)}
          </Text>
        ) : null}
        <Text style={[st.small, { marginTop: 6 }]}>
          Sector multiple range ({sm.sector}): {sm.low.toFixed(1)}× – {sm.high.toFixed(1)}× ARR, median {sm.mid.toFixed(1)}× ·
          source: {sm.source}
        </Text>
      </View>

      <Text style={st.p}>
        This certificate records the Startup Value Index (SVI) score and the indicative valuation range BlockID.au
        computed for {data.startupName} on the issue date, from the evidence the startup supplied. It is issued so
        an investor can verify, independently of the founder, what BlockID.au assessed and when. Page 2 sets out the
        eight dimension scores, the evidence base and the assumptions; page 3 carries the methodology, the
        disclaimer and the issuing entity.
      </Text>
      <Text style={st.small}>
        Indicative only — not an independent valuation report and not financial product advice. See page 3.
      </Text>
      <Footer />
    </Page>
  );
}

/* ── Page 2 — dimensions, evidence, assumptions ──────────────────────── */

function DimensionsPage({ data, watermark, revokedAt }: ValuationCertificatePdfProps) {
  const subs = data.dimensions.map((d) => ({
    key: d.key,
    label: d.label,
    value: d.score,
    adjustment: 0,
    rationale: "",
    evidence: [],
    gaps: [],
  })) as SVIAnalysis["subs"];
  const ev = data.evidence;
  return (
    <Page size="A4" style={st.page}>
      <Chrome watermark={watermark} revokedAt={revokedAt} />
      <Text style={st.eyebrow}>{data.certificateNo} · {data.startupName}</Text>
      <Text style={st.h2}>Eight SVI dimensions</Text>
      <View style={[st.row, { alignItems: "flex-start" }]}>
        <View style={{ width: "58%" }}>
          <View style={st.tr} wrap={false}>
            <View style={[st.th, { width: "52%" }]}><Text>Dimension</Text></View>
            <View style={[st.th, { width: "24%" }]}><Text>Weight</Text></View>
            <View style={[st.th, { width: "24%" }]}><Text>Score / 100</Text></View>
          </View>
          {data.dimensions.map((d) => (
            <View key={d.key} style={st.tr} wrap={false}>
              <View style={[st.td, { width: "52%" }]}><Text>{d.label} ({d.key.toUpperCase()})</Text></View>
              <View style={[st.td, { width: "24%" }]}><Text>{d.weightPct}%</Text></View>
              <View style={[st.td, { width: "24%" }]}><Text>{Math.round(d.score)}</Text></View>
            </View>
          ))}
        </View>
        <View style={{ width: "42%", alignItems: "center" }}>
          <RadarChartSVG subs={subs} size={190} />
        </View>
      </View>

      <Text style={st.h2}>Evidence base</Text>
      <View style={st.card}>
        <View style={st.row}>
          <KV label="Evidence items" value={String(ev.total)} width="25%" />
          <KV label="Verified" value={String(ev.verified)} width="25%" />
          <KV label="Last verified" value={ev.lastVerifiedAt ? certificateDate(ev.lastVerifiedAt) : "None verified"} width="50%" />
        </View>
        <Text style={[st.kvLabel, { marginTop: 8 }]}>By category</Text>
        <Text style={st.small}>
          {ev.byCategory.length
            ? ev.byCategory.map((c) => `${c.category.replace(/_/g, " ")}: ${c.count}`).join(" · ")
            : "No evidence items were on file at issue."}
        </Text>
        <Text style={[st.kvLabel, { marginTop: 6 }]}>By dimension</Text>
        <Text style={st.small}>
          {ev.byDimension.length
            ? ev.byDimension.map((d) => `${d.dimension.toUpperCase()}: ${d.count}`).join(" · ")
            : "—"}
        </Text>
      </View>

      <Text style={st.h2}>Assumptions & limitations</Text>
      {CERTIFICATE_ASSUMPTIONS.map((line, i) => (
        <View key={i} style={st.bulletRow}>
          <Text style={st.bulletDot}>•</Text>
          <Text style={st.bulletText}>{line}</Text>
        </View>
      ))}
      <Footer />
    </Page>
  );
}

/* ── Page 3 — methodology, disclaimer, signature ─────────────────────── */

function MethodologyPage({ data, contentHash, watermark, revokedAt }: ValuationCertificatePdfProps) {
  return (
    <Page size="A4" style={st.page}>
      <Chrome watermark={watermark} revokedAt={revokedAt} />
      <Text style={st.eyebrow}>{data.certificateNo} · {data.startupName}</Text>
      <Text style={st.h2}>Methodology</Text>
      <Text style={st.p}>{DOCTORAL_SENTENCE}</Text>
      <Text style={st.p}>
        The eight dimensions on page 2 — Founder & Team Value, Market & Problem Clarity, Product & Technical Depth,
        Traction & Revenue, Cap Table & Governance, Investor Readiness, Legal & Compliance, and Strategic Vision &
        Moat — are each scored against 13 criteria and weighted into the composite SVI. The indicative A$ range is
        derived from that composite against Australian stage comparables and, when the startup has connected
        revenue, cross-checked against ARR × the sector multiple range shown on page 1 ({METHOD_LABELS[data.valuation.method]}).
      </Text>
      <Text style={st.h2}>Data principle</Text>
      <Text style={st.p}>{DATA_PRINCIPLE_SENTENCE}</Text>

      <Text style={st.h2}>Important notice</Text>
      <Text style={st.disclaimer}>{CERTIFICATE_DISCLAIMER}</Text>

      <View style={st.signature}>
        <Text style={st.kvLabel}>Issued by</Text>
        <Text style={[st.kvValue, { fontSize: 11 }]}>{LEGAL_ENTITY_NAME}</Text>
        <Text style={st.small}>{LEGAL_ENTITY_ACN} · {LEGAL_ENTITY_ABN} · trading as BlockID.au · Sydney NSW, Australia</Text>
        <View style={st.sigLine} />
        <Text style={st.small}>Automated issuance — sealed by content hash, no wet signature</Text>
        <View style={{ marginTop: 10 }}>
          <Text style={st.kvLabel}>Certificate no.</Text>
          <Text style={st.mono}>{data.certificateNo}</Text>
          <Text style={[st.kvLabel, { marginTop: 4 }]}>Content hash (SHA-256 of the canonical certificate payload)</Text>
          <Text style={st.mono}>{contentHash}</Text>
          <Text style={[st.kvLabel, { marginTop: 4 }]}>Issued</Text>
          <Text style={st.mono}>{data.issuedAt}</Text>
          <Text style={[st.kvLabel, { marginTop: 4 }]}>Verify</Text>
          <Text style={st.mono}>{data.verifyUrl}</Text>
        </View>
      </View>
      <Text style={[st.small, { marginTop: 8 }]}>
        Produced by BlockID.au · {LEGAL_ENTITY_LINE}. Certificate format {data.version}.
      </Text>
      <Footer />
    </Page>
  );
}

export function ValuationCertificatePDF(props: ValuationCertificatePdfProps) {
  const { data } = props;
  return (
    <Document
      title={`Valuation certificate ${data.certificateNo} — ${data.startupName}`}
      author="BlockID.au"
      subject="Startup Value Index valuation certificate"
      creator="BlockID.au"
    >
      <CoverPage {...props} />
      <DimensionsPage {...props} />
      <MethodologyPage {...props} />
    </Document>
  );
}

/** Render to bytes — what the certificate PDF route and the data-room save use. */
export async function renderValuationCertificatePdf(props: ValuationCertificatePdfProps): Promise<Buffer> {
  return renderToBuffer(<ValuationCertificatePDF {...props} />);
}
