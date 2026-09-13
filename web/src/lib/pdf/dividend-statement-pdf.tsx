/**
 * Shareholder distribution statement PDF (S25-B) — one A4 page per
 * shareholder, rendered from the payload frozen on
 * `dividend_statements.payload` (migration 0350), never a recompute.
 *
 *   Entity block   the FOUNDER's company as entered on the project — name,
 *                  ACN / ABN (or "not supplied"), address when known. BlockID's
 *                  own entity is never printed as the payer.
 *   Statement      number, date made, date paid, period, franking %,
 *                  corporate tax rate for imputation (25 % base rate entity
 *                  / 30 %), per-share amount.
 *   Shareholder    name, role, share class, holding, ownership %, TFN quoted.
 *   Amounts        gross, franked, unfranked, franking credit, TFN withheld,
 *                  net paid, grossed-up (assessable) — the ITAA 1997
 *                  s 202-80 fields.
 *   Notes          the statement's plain-English notes.
 *   Footer         BlockID general-advice + "not tax advice" disclaimer; the
 *                  S21-A watermark when a label is given; VOID banner when
 *                  voided.
 */

import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { C, Footer, HeaderBar } from "./svi-report-pdf";
import { WatermarkLayer } from "./watermark";
import { formatAudCents, type DividendStatementPayload } from "@/lib/dividends/statement";

/**
 * Not-tax-advice footer for the statement. Names BlockID.au as the tool only
 * — the paying entity is the founder's company on the page — so the wording
 * deliberately carries no ACN / ABN of BlockID's own entity.
 */
export const DIVIDEND_STATEMENT_DISCLAIMER =
  "This distribution statement was prepared with BlockID.au from the dividend record, cap table and company details entered by the paying company, which is solely responsible for its accuracy. " +
  "BlockID.au is not the paying entity, is not a registered tax agent and does not hold an Australian Financial Services Licence (AFSL). " +
  "This document is general information only — not tax, legal, accounting or personal financial product advice under s766B of the Corporations Act 2001 (Cth). " +
  "Confirm the franking, TFN withholding and reporting obligations with a registered tax agent before lodging.";

export interface DividendStatementPdfProps {
  data: DividendStatementPayload;
  /** `blockid:v1:<hex>` — printed in full at the foot of the page. */
  contentHash: string;
  /** From `watermarkLabel()`; null → clean page. */
  watermark: string | null;
  /** Set when the statement has been voided — a banner is printed. */
  voidedAt?: string | null;
  voidReason?: string | null;
}

const AU_DATE = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "Australia/Sydney" });

export function statementDate(iso: string): string {
  const d = new Date(iso);
  return AU_DATE.format(Number.isNaN(d.getTime()) ? new Date() : d);
}

/** `YYYY-MM-DD` → "15 July 2026" without a timezone shift. */
export function statementDay(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return statementDate(ymd);
  return AU_DATE.format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)));
}

export function periodLabel(period: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return period;
  return new Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 15)));
}

export function pct(v: number): string {
  return `${Number.isInteger(v) ? v : v.toFixed(2)}%`;
}

export function taxRateLabel(rate: number, base: boolean): string {
  return `${Math.round(rate * 100)}%${base ? " (base rate entity)" : ""}`;
}

export const st = StyleSheet.create({
  page: { paddingTop: 46, paddingBottom: 56, paddingHorizontal: 52, fontFamily: "Helvetica", fontSize: 9, color: C.ink800, backgroundColor: C.white },
  eyebrow: { fontSize: 7.5, fontFamily: "Helvetica-Bold", letterSpacing: 1.4, textTransform: "uppercase", color: C.brand700, marginBottom: 6 },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", color: C.ink900, marginBottom: 2 },
  subtitle: { fontSize: 9.5, color: C.ink500, marginBottom: 12 },
  h2: { fontSize: 11, fontFamily: "Helvetica-Bold", color: C.ink900, marginTop: 8, marginBottom: 4 },
  small: { fontSize: 7.5, color: C.ink500, lineHeight: 1.4 },
  mono: { fontFamily: "Courier", fontSize: 7.5, color: C.ink700 },
  card: { borderWidth: 1, borderColor: C.surface200, borderRadius: 6, padding: 9, backgroundColor: C.surface50, marginBottom: 8 },
  row: { flexDirection: "row", gap: 10 },
  kvLabel: { fontSize: 6.5, fontFamily: "Helvetica-Bold", letterSpacing: 0.8, textTransform: "uppercase", color: C.ink500 },
  kvValue: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: C.ink900, marginTop: 2 },
  tr: { flexDirection: "row" },
  th: { padding: 4, fontFamily: "Helvetica-Bold", fontSize: 7.5, backgroundColor: C.brand50, borderBottomWidth: 1, borderBottomColor: C.surface200 },
  td: { padding: 4, fontSize: 8.5, borderBottomWidth: 1, borderBottomColor: C.surface200 },
  tdRight: { textAlign: "right" },
  total: { backgroundColor: C.surface100, fontFamily: "Helvetica-Bold" },
  bulletRow: { flexDirection: "row", marginBottom: 2, paddingLeft: 2 },
  bulletDot: { width: 9, color: C.ink500 },
  bulletText: { flex: 1, lineHeight: 1.35, fontSize: 8 },
  disclaimer: { marginTop: 8, padding: 8, borderWidth: 1, borderColor: C.amber500, backgroundColor: C.amber50, borderRadius: 6, fontSize: 7, color: C.ink700, lineHeight: 1.4 },
  voided: { position: "absolute", top: 10, left: 52, right: 52, padding: 4, backgroundColor: C.red100, borderRadius: 4, textAlign: "center", fontSize: 8, fontFamily: "Helvetica-Bold", color: C.red600 },
});

export function KV({ label, value, width }: { label: string; value: string; width?: string | number }) {
  return (
    <View style={{ width }}>
      <Text style={st.kvLabel}>{label}</Text>
      <Text style={st.kvValue}>{value}</Text>
    </View>
  );
}

export function EntityBlock({ entity }: { entity: DividendStatementPayload["entity"] }) {
  return (
    <View style={st.card}>
      <Text style={st.kvLabel}>Paying entity</Text>
      <Text style={[st.kvValue, { fontSize: 12 }]}>{entity.name}</Text>
      <Text style={st.small}>
        ACN {entity.acn ?? "not supplied"} · ABN {entity.abn ?? "not supplied"}
        {entity.address ? ` · ${entity.address}` : ""}
      </Text>
    </View>
  );
}

function AmountRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={st.tr} wrap={false}>
      <View style={[st.td, { width: "62%" }, bold ? st.total : {}]}><Text>{label}</Text></View>
      <View style={[st.td, st.tdRight, { width: "38%" }, bold ? st.total : {}]}><Text>{value}</Text></View>
    </View>
  );
}

export function DividendStatementPDF({ data, contentHash, watermark, voidedAt, voidReason }: DividendStatementPdfProps) {
  const a = data.amounts;
  const sh = data.shareholder;
  const dv = data.dividend;
  return (
    <Document title={`Dividend statement ${data.statementNo} — ${sh.name}`} author={data.entity.name} subject="Shareholder distribution statement" creator="BlockID.au">
      <Page size="A4" style={st.page}>
        <HeaderBar />
        <WatermarkLayer label={watermark} />
        {voidedAt ? (
          <Text style={st.voided} fixed>
            VOID — this statement was voided on {statementDate(voidedAt)}{voidReason ? ` (${voidReason})` : ""} and must not be relied on.
          </Text>
        ) : null}

        <Text style={st.eyebrow}>Dividend / distribution statement</Text>
        <Text style={st.title}>Distribution statement</Text>
        <Text style={st.subtitle}>
          Statement {data.statementNo} · made {statementDate(data.statementDate)} · dividend for {periodLabel(dv.period)} · ITAA 1997 s 202-80
        </Text>

        <EntityBlock entity={data.entity} />

        <View style={st.card}>
          <View style={st.row}>
            <KV label="Shareholder" value={sh.name} width="40%" />
            <KV label="Role" value={sh.role} width="20%" />
            <KV label="Share class" value={sh.shareClass ?? "Ordinary"} width="20%" />
            <KV label="TFN / ABN quoted" value={sh.tfnOnFile ? "Yes" : "No"} width="20%" />
          </View>
          <View style={[st.row, { marginTop: 6 }]}>
            <KV label="Shares held" value={sh.sharesHeld.toLocaleString("en-AU")} width="40%" />
            <KV label="Ownership" value={pct(sh.ownershipPct)} width="20%" />
            <KV label="Date paid" value={statementDay(dv.paidAt)} width="20%" />
            <KV label="Per share" value={`A$${dv.perShareAud.toFixed(6)}`} width="20%" />
          </View>
        </View>

        <Text style={st.h2}>Amounts (AUD)</Text>
        <View style={st.tr} wrap={false}>
          <View style={[st.th, { width: "62%" }]}><Text>Item</Text></View>
          <View style={[st.th, st.tdRight, { width: "38%" }]}><Text>Amount</Text></View>
        </View>
        <AmountRow label="Amount of dividend (gross)" value={formatAudCents(a.grossAud)} />
        <AmountRow label={`Franked amount (${pct(a.frankingPct)} franked)`} value={formatAudCents(a.frankedAud)} />
        <AmountRow label="Unfranked amount" value={formatAudCents(a.unfrankedAud)} />
        <AmountRow label={`Franking credit (corporate tax rate for imputation ${taxRateLabel(dv.companyTaxRate, data.entity.isBaseRateEntity)})`} value={formatAudCents(a.frankingCreditAud)} />
        <AmountRow label={a.tfnWithheldAud > 0 ? `TFN amount withheld (${Math.round(a.tfnWithholdingRate * 100)}% of the unfranked amount)` : "TFN amount withheld"} value={formatAudCents(a.tfnWithheldAud)} />
        <AmountRow label="Net amount paid to shareholder" value={formatAudCents(a.netPaidAud)} bold />
        <AmountRow label="Grossed-up (assessable) amount = dividend + franking credit" value={formatAudCents(a.grossedUpAud)} />

        <View style={[st.row, { marginTop: 8 }]}>
          <KV label="Franking percentage" value={pct(a.frankingPct)} width="25%" />
          <KV label="Corporate tax rate for imputation" value={taxRateLabel(dv.companyTaxRate, data.entity.isBaseRateEntity)} width="35%" />
          <KV label="Total dividend declared" value={formatAudCents(dv.totalDividendAud)} width="20%" />
          <KV label="Declared" value={statementDate(dv.declaredAt)} width="20%" />
        </View>

        <Text style={st.h2}>Notes</Text>
        {data.notes.map((line, i) => (
          <View key={i} style={st.bulletRow}>
            <Text style={st.bulletDot}>•</Text>
            <Text style={st.bulletText}>{line}</Text>
          </View>
        ))}
        {!data.totals.ok ? (
          <Text style={[st.small, { color: C.amber700, marginTop: 4 }]}>Rounding check: the parts of this statement do not re-add to the cent — review before sending.</Text>
        ) : null}

        <Text style={st.disclaimer}>{DIVIDEND_STATEMENT_DISCLAIMER}</Text>
        <Text style={[st.small, { marginTop: 6 }]}>
          Statement {data.statementNo} · format {data.version} · content hash (SHA-256 of the canonical statement payload):
        </Text>
        <Text style={st.mono}>{contentHash}</Text>
        <Footer brandText={`${data.entity.name} · Distribution statement ${data.statementNo}`} />
      </Page>
    </Document>
  );
}

/** Render to bytes — what the statement PDF route and the data-room save use. */
export async function renderDividendStatementPdf(props: DividendStatementPdfProps): Promise<Buffer> {
  return renderToBuffer(<DividendStatementPDF {...props} />);
}
