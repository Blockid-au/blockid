// IC memo / one-pager PDF (G13-W5-D3, S-D3; BA spec §A.3 block 4 "IC memo
// export", §A.5 S6 / F3; goal doc §3 F3, risk R5).
//
// One persisted `ic_reports.sections` record (lib/evaluations/ic-reports.ts)
// + the two dossier visuals (cover radar, valuation range bars — the same
// VisualSpecV2 the web renders, drawn by the react-pdf twin) → one A4
// document:
//
//   one_page  Scout: header numbers · radar · weighted table (weighted score
//             column; raw weights only when `weightsShown`) · decision record
//             · valuation consensus line · top-3 risks · top-3 questions.
//             ONE page (the colocated test pins it).
//   memo      Firm / Program: page 1 = the above in full · page 2 = valuation
//             range bars + methods + my view, risks, questions · page 3 =
//             "Seat views" (each seat's decision, conviction, top risk) +
//             consensus row. 2–4 pages (the test pins the range).
//
// Footer on every page: "Prepared with BlockID.au · Auschain PTY LTD · not
// financial advice · page x/y" (S6). private_notes never reach `sections`,
// so they can never reach the PDF. Fonts: built-in Helvetica.

import { HELVETICA, pdfFontsForLocale, vietnameseHyphenation, type PdfFontSet } from "@/lib/pdf/fonts";
import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import { BAND_COLOUR, INK, aud } from "@/lib/report-visuals";
import { VisualPdf } from "@/lib/report-visuals/pdf";
import { pdfSafeText as t } from "@/lib/report-visuals/pdf-text";
import type { Band, VisualSpecV2 } from "@/lib/report-visuals/types";
import type { IcReportKind, IcSections } from "@/lib/evaluations/ic-reports";
import { AdviceDisclaimer, PDF_ENTITY_LINE } from "./advice-disclaimer";
import { pdfPageCount } from "./page-count";

export const IC_MEMO_FOOTER = "Prepared with BlockID.au · Auschain PTY LTD · not financial advice";
export const IC_MEMO_MAX_PAGES = 4;

const C = { ink: INK.text, muted: INK.muted, faint: INK.faint, grid: INK.grid, surface: INK.surfaceAlt, brand: "#0072B2", brandSoft: "#EAF3FA" };
const MM = 72 / 25.4;
const MARGIN = 16 * MM;

/** Swap the memo's font family in place for the current render (react-pdf renders synchronously inside renderToBuffer). */
function applyMemoFonts(f: PdfFontSet) {
  const regular = f.regular;
  const bold = f.bold;
  const boldWeight = f.boldWeight;
  for (const k of ["page", "body", "small", "tiny"] as const) {
    (s[k] as { fontFamily?: string }).fontFamily = regular;
  }
  for (const k of ["kicker", "h1", "h2", "h3"] as const) {
    const st = s[k] as { fontFamily?: string; fontWeight?: number };
    st.fontFamily = bold;
    if (boldWeight !== undefined) st.fontWeight = boldWeight;
    else delete st.fontWeight;
  }
}

const s = StyleSheet.create({
  page: { paddingTop: MARGIN, paddingBottom: MARGIN + 12, paddingHorizontal: MARGIN, fontFamily: "Helvetica", fontSize: 9, color: C.ink },
  footer: { position: "absolute", left: MARGIN, right: MARGIN, bottom: 20, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: C.faint },
  kicker: { fontSize: 7.5, letterSpacing: 1.2, textTransform: "uppercase", color: C.brand, fontFamily: "Helvetica-Bold" },
  h1: { fontSize: 18, fontFamily: "Helvetica-Bold", marginTop: 2 },
  h2: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 8, marginBottom: 4, borderBottomWidth: 1, borderBottomColor: C.grid, paddingBottom: 3 },
  h3: { fontSize: 9.5, fontFamily: "Helvetica-Bold", marginTop: 6, marginBottom: 2 },
  body: { fontSize: 9, lineHeight: 1.4 },
  small: { fontSize: 7.5, color: C.muted, lineHeight: 1.35 },
  tiny: { fontSize: 7, color: C.faint },
  bold: { fontFamily: "Helvetica-Bold" },
  row: { flexDirection: "row" },
  tiles: { flexDirection: "row", marginTop: 6, marginBottom: 6 },
  tile: { flex: 1, borderWidth: 1, borderColor: C.grid, borderRadius: 4, padding: 6, marginRight: 6 },
  tileV: { fontSize: 15, fontFamily: "Helvetica-Bold" },
  tileL: { fontSize: 7, color: C.muted },
  box: { borderWidth: 1, borderColor: C.grid, borderRadius: 4, padding: 7, marginBottom: 6 },
  softBox: { backgroundColor: C.surface, borderRadius: 4, padding: 7, marginBottom: 6 },
  table: { borderWidth: 1, borderColor: C.grid, borderRadius: 3, marginBottom: 6 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.grid, paddingVertical: 2, paddingHorizontal: 4 },
  th: { fontSize: 6.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: "Helvetica-Bold" },
  td: { fontSize: 8 },
  c1: { flex: 1 },
  c2: { flex: 2 },
  c3: { flex: 3 },
  right: { textAlign: "right" },
  bullet: { flexDirection: "row", marginBottom: 1.5 },
  bulletMark: { width: 10, fontSize: 8 },
  bulletText: { flex: 1, fontSize: 8, lineHeight: 1.35 },
  pill: { fontSize: 7, fontFamily: "Helvetica-Bold", color: C.brand, backgroundColor: C.brandSoft, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3, marginRight: 4 },
  decision: { fontSize: 16, fontFamily: "Helvetica-Bold", textTransform: "uppercase" },
});

const DECISION_COLOUR: Record<string, string> = { pass: "#B42318", track: "#B54708", proceed: "#067647" };
const bandColour = (b: string): string => BAND_COLOUR[(b as Band) in BAND_COLOUR ? (b as Band) : "pending"];
const stars = (n: number | null): string => (n == null ? "—" : `${"*".repeat(n)}${".".repeat(Math.max(0, 5 - n))} ${n}/5`);

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
}

function Footer({ startup }: { startup: string }) {
  return (
    <View style={s.footer} fixed>
      <Text>{t(`${IC_MEMO_FOOTER} · ${startup}`)}</Text>
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

function Bullets({ title, items, mark, max }: { title: string; items: string[]; mark: string; max?: number }) {
  const list = max ? items.slice(0, max) : items;
  return (
    <View style={{ flex: 1, marginRight: 6 }}>
      <Text style={s.th}>{t(title)}</Text>
      {list.length === 0 ? <Text style={s.small}>None recorded.</Text> : null}
      {list.map((it, i) => (
        <View key={i} style={s.bullet}>
          <Text style={s.bulletMark}>{mark}</Text>
          <Text style={s.bulletText}>{t(it)}</Text>
        </View>
      ))}
    </View>
  );
}

function Header({ sections, kind }: { sections: IcSections; kind: IcReportKind }) {
  const sm = sections.summary;
  const line = [sm.sector, sm.stageLabel, sm.state, sm.website].filter(Boolean).join(" · ");
  return (
    <View>
      <Text style={s.kicker}>{kind === "memo" ? "Investment committee memo · BlockID Investor Dossier" : "Investor one-pager · BlockID Investor Dossier"}</Text>
      <Text style={s.h1}>{t(sm.startupName)}</Text>
      <Text style={s.small}>{t(`${line || "No classification yet"} · snapshot ${fmtDate(sm.snapshotAt)} · consent ${sm.consentTier.replace(/_/g, " ")}`)}</Text>
      <View style={s.tiles}>
        <Tile v={sm.svi == null ? "—" : String(Math.round(sm.svi))} l={`SVI · ${sm.sviBand}`} />
        <Tile v={sm.delta30d == null ? "—" : `${sm.delta30d > 0 ? "+" : ""}${sm.delta30d}`} l="Δ 30 days" />
        <Tile v={sm.percentile == null ? "—" : `p${sm.percentile}`} l="Stage-cohort percentile" />
        <Tile v={`${sm.evidenceItems}`} l={`Evidence items · ${sm.evidenceConnected} connected`} />
      </View>
    </View>
  );
}

function WeightedTable({ sections, weightsShown }: { sections: IcSections; weightsShown: boolean }) {
  return (
    <View style={s.table}>
      <View style={s.tr}>
        <Text style={[s.th, s.c3]}>Dimension</Text>
        {weightsShown ? <Text style={[s.th, s.c1, s.right]}>Weight</Text> : null}
        <Text style={[s.th, s.c1, s.right]}>Score</Text>
        <Text style={[s.th, s.c1, s.right]}>Weighted</Text>
        <Text style={[s.th, s.c1, s.right]}>p50</Text>
        <Text style={[s.th, s.c2, s.right]}>My view</Text>
      </View>
      {sections.svi_table.map((r) => (
        <View key={r.dim} style={s.tr}>
          <Text style={[s.td, s.c3]}>{t(`${r.dim} ${r.title}`)}</Text>
          {weightsShown ? <Text style={[s.td, s.c1, s.right]}>{r.weight == null ? "—" : String(r.weight)}</Text> : null}
          <Text style={[s.td, s.c1, s.right, s.bold, { color: bandColour(r.band) }]}>{r.score == null ? "—" : String(r.score)}</Text>
          <Text style={[s.td, s.c1, s.right]}>{r.weighted == null ? "—" : String(r.weighted)}</Text>
          <Text style={[s.td, s.c1, s.right]}>{String(r.p50)}</Text>
          <Text style={[s.td, s.c2, s.right]}>{r.myRating == null ? "—" : t(`${r.myRating}/5 ${r.myStance ?? ""}`)}</Text>
        </View>
      ))}
    </View>
  );
}

function DecisionRecord({ sections }: { sections: IcSections }) {
  const d = sections.decision;
  const tf = sections.thesis_fit;
  return (
    <View style={[s.box, s.row]} wrap={false}>
      <View style={{ width: 130 }}>
        <Text style={s.th}>Decision</Text>
        <Text style={[s.decision, { color: d.value ? DECISION_COLOUR[d.value] : C.faint }]}>{d.value ?? "none yet"}</Text>
        <Text style={s.tiny}>{t(d.status ? `${d.status} · v${d.version ?? 1}${d.submittedAt ? ` · ${fmtDate(d.submittedAt)}` : ""}` : "no assessment recorded")}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.body}>{t(`Conviction ${stars(d.conviction)}`)}</Text>
        <Text style={s.body}>{t(`Thesis fit ${tf.pct == null ? "—" : `${tf.pct}%`}${tf.mandateLabel ? ` · mandate "${tf.mandateLabel}"${tf.fitScore != null ? ` scores ${tf.fitScore}%` : ""}` : ""}`)}</Text>
        {tf.reasons.length ? <Text style={s.small}>{t(`Fits: ${tf.reasons.join("; ")}`)}</Text> : null}
        {tf.gaps.length ? <Text style={s.small}>{t(`Gaps: ${tf.gaps.join("; ")}`)}</Text> : null}
        {d.sharedNotes ? <Text style={[s.small, { marginTop: 3 }]}>{t(`Notes shared with the founder: ${d.sharedNotes.slice(0, 600)}`)}</Text> : null}
      </View>
    </View>
  );
}

function ValuationLine({ sections }: { sections: IcSections }) {
  const v = sections.valuation;
  if (!v.consensus) return <Text style={s.small}>Valuation not available — the startup has no scored snapshot yet.</Text>;
  const ask = v.ask && typeof v.ask === "object" ? (v.ask as { preMoneyAud?: number; raiseAud?: number }) : null;
  return (
    <Text style={s.body}>
      {t(
        `Consensus ${aud(v.consensus.lowAud)} – ${aud(v.consensus.highAud)} (mid ${aud(v.consensus.midAud)}, confidence ${Math.round(v.consensus.confidence * 100)}%)` +
          `${ask?.preMoneyAud ? ` · founder ask ${aud(ask.preMoneyAud)} pre-money` : ""}` +
          `${v.myView && (v.myView.lowAud || v.myView.highAud) ? ` · my view ${aud(v.myView.lowAud ?? v.myView.highAud ?? 0)} – ${aud(v.myView.highAud ?? v.myView.lowAud ?? 0)}` : ""}` +
          ` · ${v.comparablesN} AU comparables`,
      )}
    </Text>
  );
}

function ValuationChapter({ sections, rangeBars }: { sections: IcSections; rangeBars: VisualSpecV2 | null }) {
  const v = sections.valuation;
  return (
    <View>
      <Text style={s.h2}>Valuation</Text>
      <ValuationLine sections={sections} />
      {rangeBars ? (
        <View style={{ alignItems: "center", marginVertical: 6 }} wrap={false}>
          <VisualPdf spec={rangeBars} widthPt={400} />
          <Text style={s.tiny}>{t(rangeBars.subtitle ?? rangeBars.title)}</Text>
        </View>
      ) : null}
      {v.methods.length ? (
        <View style={s.table} wrap={false}>
          <View style={s.tr}>
            <Text style={[s.th, s.c3]}>Method</Text>
            <Text style={[s.th, s.c1, s.right]}>Weight</Text>
            <Text style={[s.th, s.c2, s.right]}>Low</Text>
            <Text style={[s.th, s.c2, s.right]}>Mid</Text>
            <Text style={[s.th, s.c2, s.right]}>High</Text>
          </View>
          {v.methods.map((m) => (
            <View key={m.method} style={s.tr}>
              <Text style={[s.td, s.c3]}>{t(m.label)}</Text>
              <Text style={[s.td, s.c1, s.right]}>{`${Math.round(m.weight * 100)}%`}</Text>
              <Text style={[s.td, s.c2, s.right]}>{t(aud(m.lowAud))}</Text>
              <Text style={[s.td, s.c2, s.right]}>{t(aud(m.midAud))}</Text>
              <Text style={[s.td, s.c2, s.right]}>{t(aud(m.highAud))}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {v.myView?.note ? <Text style={s.small}>{t(`My valuation note: ${v.myView.note}`)}</Text> : null}
    </View>
  );
}

function RisksAndQuestions({ sections, max }: { sections: IcSections; max?: number }) {
  return (
    <View style={s.row} wrap={false}>
      <Bullets title="Risks" items={sections.risks.map((r) => `${r.severity.toUpperCase()}${r.dimension ? ` · ${r.dimension}` : ""} — ${r.title}${r.note ? `: ${r.note}` : ""}`)} mark="!" max={max} />
      <Bullets title="Questions for the founder" items={sections.questions.map((q) => `${q.dimension ? `${q.dimension} · ` : ""}${q.text}`)} mark="?" max={max} />
    </View>
  );
}

function SeatViews({ sections }: { sections: IcSections }) {
  const c = sections.consensus;
  return (
    <View>
      <Text style={s.h2}>Seat views</Text>
      {sections.seats.length === 0 ? <Text style={s.small}>Single seat — no other views on this evaluation.</Text> : null}
      {sections.seats.length ? (
        <View style={s.table}>
          <View style={s.tr}>
            <Text style={[s.th, s.c2]}>Seat</Text>
            <Text style={[s.th, s.c1]}>Status</Text>
            <Text style={[s.th, s.c1]}>Decision</Text>
            <Text style={[s.th, s.c1]}>Conviction</Text>
            <Text style={[s.th, s.c3]}>Top risk</Text>
          </View>
          {sections.seats.map((seat, i) => (
            <View key={i} style={s.tr}>
              <Text style={[s.td, s.c2]}>{t(seat.displayName)}</Text>
              <Text style={[s.td, s.c1]}>{seat.status ?? "not started"}</Text>
              <Text style={[s.td, s.c1, s.bold, { color: seat.decision ? DECISION_COLOUR[seat.decision] : C.faint }]}>{seat.decision ?? "—"}</Text>
              <Text style={[s.td, s.c1]}>{seat.conviction == null ? "—" : `${seat.conviction}/5`}</Text>
              <Text style={[s.td, s.c3]}>{t(seat.topRisk ?? "—")}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {c ? (
        <View style={s.softBox} wrap={false}>
          <Text style={[s.body, s.bold]}>{t(`${c.label} · ${c.aggregate ? (c.aggregate === "split" ? "split decision" : c.aggregate.toUpperCase()) : "no submitted view yet"}`)}</Text>
          <Text style={s.small}>{t(`Tally: ${c.tally.proceed} proceed · ${c.tally.track} track · ${c.tally.pass} pass${c.meanConviction != null ? ` · mean conviction ${c.meanConviction}/5` : ""}`)}</Text>
          {c.disagreement.length ? <Text style={s.small}>{t(`Discuss: seat ratings differ by 2 or more on ${c.disagreement.join(", ")}`)}</Text> : <Text style={s.small}>No dimension where seat ratings differ by 2 or more.</Text>}
        </View>
      ) : null}
    </View>
  );
}

// ── Document ────────────────────────────────────────────────────────────────

export interface IcMemoPdfProps {
  kind: IcReportKind;
  sections: IcSections;
  radar: VisualSpecV2 | null;
  rangeBars: VisualSpecV2 | null;
  weightsShown: boolean;
  generatedAt: string;
  /** Display name of the exporter (memo `generated_by` = the owner, F3). */
  generatedBy: string;
}

export function IcMemoPdf({ kind, sections, radar, rangeBars, weightsShown, generatedAt, generatedBy }: IcMemoPdfProps) {
  const startup = sections.summary.startupName;
  const memo = kind === "memo";
  const body: ReactNode[] = [];
  body.push(<Header key="h" sections={sections} kind={kind} />);
  body.push(
    <View key="p1" style={s.row}>
      {radar ? (
        <View style={{ width: memo ? 200 : 160, alignItems: "center", marginRight: 8 }}>
          <VisualPdf spec={radar} widthPt={memo ? 190 : 150} hideBadge />
          <Text style={s.tiny}>{t(radar.subtitle ?? "8 dimensions vs stage p50")}</Text>
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <WeightedTable sections={sections} weightsShown={weightsShown} />
        {!weightsShown ? <Text style={s.tiny}>Weighted score = score × house weight / 100. Raw dimension weights are shown on the authenticated dossier; the memo prints them on Program.</Text> : null}
      </View>
    </View>,
  );
  body.push(<DecisionRecord key="d" sections={sections} />);
  if (memo) {
    body.push(
      <View key="val" break>
        <ValuationChapter sections={sections} rangeBars={rangeBars} />
        <Text style={s.h2}>Risks and questions</Text>
        <RisksAndQuestions sections={sections} />
      </View>,
    );
    body.push(
      <View key="seats" break>
        <SeatViews sections={sections} />
        <AdviceDisclaimer variant="financial" />
        <Text style={[s.tiny, { marginTop: 3 }]}>{t(`${PDF_ENTITY_LINE} · generated ${fmtDate(generatedAt)} by ${generatedBy}`)}</Text>
      </View>,
    );
  } else {
    body.push(
      <View key="one">
        <Text style={s.h3}>Valuation</Text>
        <ValuationLine sections={sections} />
        <View style={{ marginTop: 6 }}>
          <RisksAndQuestions sections={sections} max={3} />
        </View>
        <AdviceDisclaimer variant="financial" />
        <Text style={[s.tiny, { marginTop: 3 }]}>{t(`${PDF_ENTITY_LINE} · generated ${fmtDate(generatedAt)} by ${generatedBy}`)}</Text>
      </View>,
    );
  }
  return (
    <Document title={`${memo ? "IC memo" : "Investor one-pager"} — ${startup}`} author="BlockID.au" subject="Investor Dossier export" creator="BlockID.au">
      <Page size="A4" style={s.page}>
        {body}
        <Footer startup={startup} />
      </Page>
    </Document>
  );
}

export interface RenderIcMemoResult {
  buffer: Buffer;
  pages: number;
}

export async function renderIcMemoPdf(props: IcMemoPdfProps & { locale?: "en" | "vi" }): Promise<RenderIcMemoResult> {
  // Vietnamese startup names / risks need the registered Noto Sans (W5
  // review) — Helvetica's WinAnsi drops the diacritics. `pdfFontsForLocale`
  // registers on first use and falls back to Helvetica if the TTFs are absent.
  const fonts = pdfFontsForLocale(props.locale ?? "en");
  applyMemoFonts(fonts);
  const vi = props.locale === "vi";
  if (vi) Font.registerHyphenationCallback(vietnameseHyphenation);
  let buffer: Uint8Array;
  try {
    buffer = await renderToBuffer(<IcMemoPdf {...props} />);
  } finally {
    if (vi) Font.registerHyphenationCallback((w) => [w]);
    applyMemoFonts(HELVETICA);
  }
  const pages = pdfPageCount(buffer);
  if (pages > IC_MEMO_MAX_PAGES && process.env.NODE_ENV !== "test") console.warn(`[ic-memo-pdf] ${props.kind} for ${props.sections.summary.startupName} rendered ${pages} pages (budget ${IC_MEMO_MAX_PAGES})`);
  return { buffer: Buffer.from(buffer), pages };
}
