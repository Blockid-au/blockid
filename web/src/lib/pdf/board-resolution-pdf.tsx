/**
 * Board resolution PDF (S26-B) — an A4 circulating resolution of the
 * directors rendered from the payload frozen on `board_resolutions.payload`
 * (migration 0360), never a recompute. One renderer serves the three kinds
 * (share issue / dividend / ESOP adoption): the builders in
 * lib/board-resolutions/build.ts decide the wording, this file only lays
 * it out.
 *
 *   Entity block   the FOUNDER's company — name, ACN / ABN (or "not
 *                  supplied"), address when known. BlockID is never the
 *                  company on the page.
 *   Title + basis  "Circulating resolution — s 248A … passed when signed by
 *                  all directors entitled to vote" (or s 248B sole director).
 *   Facts          the key facts of the referenced record.
 *   Recitals       background.
 *   Resolutions    numbered "RESOLVED THAT" paragraphs.
 *   Signatures     one block per director stored on the cap table, else
 *                  two blank lines; each with a "Date" line.
 *   Notes          reminders (s 254X notice, s 254T timing, Div 83A …).
 *   Footer         AdviceDisclaimer (general information, not legal / tax /
 *                  financial advice) + content hash; S21-A watermark when a
 *                  label is given.
 */

import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { C, Footer, HeaderBar } from "./svi-report-pdf";
import { WatermarkLayer } from "./watermark";
import { AdviceDisclaimer } from "./advice-disclaimer";
import { longDate, type BoardResolutionPayload, type ResolutionKind } from "@/lib/board-resolutions/build";

export interface BoardResolutionPdfProps {
  data: BoardResolutionPayload;
  /** `blockid:v1:<hex>` — printed in full at the foot of the page. */
  contentHash: string;
  /** From `watermarkLabel()`; null → clean page. */
  watermark: string | null;
}

export const BOARD_RESOLUTION_NOTE =
  "This resolution was prepared with BlockID.au from the records entered by the company, which is solely responsible for its accuracy and for confirming it against the company's constitution and any shareholders' agreement. It takes effect only when signed by the directors as stated above.";

const st = StyleSheet.create({
  page: { paddingTop: 46, paddingBottom: 60, paddingHorizontal: 54, fontFamily: "Helvetica", fontSize: 9.5, color: C.ink800, backgroundColor: "#ffffff" },
  eyebrow: { fontSize: 7.5, fontFamily: "Helvetica-Bold", letterSpacing: 1.4, textTransform: "uppercase", color: C.brand700, marginBottom: 6 },
  title: { fontSize: 17, fontFamily: "Helvetica-Bold", color: C.ink900, marginBottom: 4 },
  basis: { fontSize: 8.5, color: C.ink600, marginBottom: 10, lineHeight: 1.4 },
  h2: { fontSize: 10.5, fontFamily: "Helvetica-Bold", color: C.ink900, marginTop: 10, marginBottom: 4 },
  small: { fontSize: 7.5, color: C.ink500, lineHeight: 1.4 },
  mono: { fontFamily: "Courier", fontSize: 7.5, color: C.ink700 },
  card: { borderWidth: 1, borderColor: C.surface200, borderRadius: 6, padding: 9, backgroundColor: C.surface50, marginBottom: 8 },
  kvLabel: { fontSize: 6.5, fontFamily: "Helvetica-Bold", letterSpacing: 0.8, textTransform: "uppercase", color: C.ink500 },
  kvValue: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: C.ink900, marginTop: 2 },
  factRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.surface200 },
  factLabel: { width: "36%", padding: 4, fontSize: 8, color: C.ink600 },
  factValue: { width: "64%", padding: 4, fontSize: 8.5, fontFamily: "Helvetica-Bold", color: C.ink900 },
  para: { fontSize: 9, lineHeight: 1.45, marginBottom: 4 },
  numbered: { flexDirection: "row", marginBottom: 6 },
  num: { width: 18, fontFamily: "Helvetica-Bold", fontSize: 9 },
  resolution: { flex: 1, fontSize: 9, lineHeight: 1.45 },
  sigGrid: { flexDirection: "row", flexWrap: "wrap", gap: 18, marginTop: 8 },
  sig: { width: "45%", marginBottom: 10 },
  sigLine: { borderBottomWidth: 1, borderBottomColor: C.ink900, height: 22, marginBottom: 3 },
  sigName: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: C.ink900 },
  sigRole: { fontSize: 7.5, color: C.ink500 },
  bulletRow: { flexDirection: "row", marginBottom: 2, paddingLeft: 2 },
  bulletDot: { width: 9, color: C.ink500 },
  bulletText: { flex: 1, lineHeight: 1.35, fontSize: 8 },
  note: { marginTop: 8, padding: 8, borderWidth: 1, borderColor: C.amber500, backgroundColor: C.amber50, borderRadius: 6, fontSize: 7, color: C.ink700, lineHeight: 1.4 },
});

const KIND_EYEBROW: Record<ResolutionKind, string> = {
  "share-issue": "Board resolution · issue of shares",
  dividend: "Board resolution · declaration of dividend",
  esop: "Board resolution · adoption of employee share option plan",
};

function EntityBlock({ company }: { company: BoardResolutionPayload["company"] }) {
  return (
    <View style={st.card}>
      <Text style={st.kvLabel}>Company</Text>
      <Text style={[st.kvValue, { fontSize: 12 }]}>{company.name}</Text>
      <Text style={st.small}>
        ACN {company.acn ?? "not supplied"} · ABN {company.abn ?? "not supplied"}
        {company.address ? ` · ${company.address}` : ""}
      </Text>
    </View>
  );
}

function Signatures({ data }: { data: BoardResolutionPayload }) {
  const blocks = data.directors.length > 0 ? data.directors.map((d) => d.name) : ["", ""];
  return (
    <View style={st.sigGrid}>
      {blocks.map((name, i) => (
        <View key={i} style={st.sig} wrap={false}>
          <View style={st.sigLine} />
          <Text style={st.sigName}>{name || "Director name: ____________________"}</Text>
          <Text style={st.sigRole}>{data.soleDirector ? "Sole director" : "Director"} · Date: ____ / ____ / ________</Text>
        </View>
      ))}
    </View>
  );
}

export function BoardResolutionPDF({ data, contentHash, watermark }: BoardResolutionPdfProps) {
  return (
    <Document title={`${data.title} — ${data.company.name}`} author={data.company.name} subject="Circulating resolution of the directors" creator="BlockID.au">
      <Page size="A4" style={st.page}>
        <HeaderBar />
        <WatermarkLayer label={watermark} />

        <Text style={st.eyebrow}>{KIND_EYEBROW[data.kind]}</Text>
        <Text style={st.title}>{data.title}</Text>
        <Text style={st.basis}>{data.basis}</Text>

        <EntityBlock company={data.company} />

        <Text style={st.h2}>Key facts</Text>
        <View>
          {data.facts.map((f, i) => (
            <View key={i} style={st.factRow} wrap={false}>
              <Text style={st.factLabel}>{f.label}</Text>
              <Text style={st.factValue}>{f.value}</Text>
            </View>
          ))}
        </View>

        <Text style={st.h2}>Background</Text>
        {data.recitals.map((line, i) => (
          <Text key={i} style={st.para}>
            {line}
          </Text>
        ))}

        <Text style={st.h2}>Resolutions</Text>
        {data.resolutions.map((line, i) => (
          <View key={i} style={st.numbered} wrap={false}>
            <Text style={st.num}>{i + 1}.</Text>
            <Text style={st.resolution}>{line}</Text>
          </View>
        ))}

        <Text style={st.h2}>{data.soleDirector ? "Signed by the sole director" : "Signed by the directors"}</Text>
        <Text style={st.para}>
          {data.soleDirector
            ? "The undersigned, being the sole director of the Company, records the above resolutions under s 248B of the Corporations Act 2001 (Cth)."
            : "Each of the undersigned, being a director of the Company entitled to vote on the resolutions, states that they are in favour of the above resolutions. The resolutions are passed on the day the last director signs (s 248A(3))."}
        </Text>
        <Signatures data={data} />

        <Text style={st.h2}>Reminders</Text>
        {data.notes.map((line, i) => (
          <View key={i} style={st.bulletRow}>
            <Text style={st.bulletDot}>•</Text>
            <Text style={st.bulletText}>{line}</Text>
          </View>
        ))}

        <Text style={st.note}>{BOARD_RESOLUTION_NOTE}</Text>
        <AdviceDisclaimer />
        <Text style={[st.small, { marginTop: 6 }]}>
          Prepared {longDate(data.preparedAt)} · format {data.version} · content hash (SHA-256 of the canonical resolution payload):
        </Text>
        <Text style={st.mono}>{contentHash}</Text>
        <Footer brandText={`${data.company.name} · ${data.title}`} />
      </Page>
    </Document>
  );
}

/** Render to bytes — what the PDF route and the data-room save use. */
export async function renderBoardResolutionPdf(props: BoardResolutionPdfProps): Promise<Buffer> {
  return renderToBuffer(<BoardResolutionPDF {...props} />);
}

export const renderShareIssueResolutionPdf = renderBoardResolutionPdf;
export const renderDividendResolutionPdf = renderBoardResolutionPdf;
export const renderEsopResolutionPdf = renderBoardResolutionPdf;
