/**
 * Dividend register PDF (S25-B) — every statement issued for one dividend
 * record, in a landscape A4 table with totals, plus the reconciliation line
 * against the record's declared total. Renders from the register payload
 * (`buildDividendRegister`) built off the frozen statement payloads; a voided
 * statement is listed and struck from the totals.
 *
 * Same entity block, footer, disclaimer and watermark as the statement so
 * the two documents read as one set.
 */

import { Document, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { C, Footer, HeaderBar } from "./svi-report-pdf";
import { WatermarkLayer } from "./watermark";
import { DIVIDEND_STATEMENT_DISCLAIMER, EntityBlock, KV, pct, periodLabel, st, statementDate, statementDay, taxRateLabel } from "./dividend-statement-pdf";
import { formatAudCents, type DividendRegisterPayload } from "@/lib/dividends/statement";

export interface DividendRegisterPdfProps {
  data: DividendRegisterPayload;
  watermark: string | null;
}

const COLS: Array<{ key: string; label: string; width: string; right?: boolean }> = [
  { key: "statementNo", label: "Statement", width: "13%" },
  { key: "shareholder", label: "Shareholder", width: "21%" },
  { key: "sharesHeld", label: "Shares", width: "9%", right: true },
  { key: "grossAud", label: "Gross", width: "10%", right: true },
  { key: "frankedAud", label: "Franked", width: "10%", right: true },
  { key: "unfrankedAud", label: "Unfranked", width: "9%", right: true },
  { key: "frankingCreditAud", label: "Franking credit", width: "10%", right: true },
  { key: "tfnWithheldAud", label: "TFN withheld", width: "9%", right: true },
  { key: "netPaidAud", label: "Net paid", width: "9%", right: true },
];

function cell(width: string, right?: boolean, extra?: object) {
  return [st.td, { width }, right ? st.tdRight : {}, extra ?? {}];
}

export function DividendRegisterPDF({ data, watermark }: DividendRegisterPdfProps) {
  const t = data.totals;
  const dv = data.dividend;
  return (
    <Document title={`Dividend register — ${data.entity.name} — ${periodLabel(dv.period)}`} author={data.entity.name} subject="Dividend register" creator="BlockID.au">
      <Page size="A4" orientation="landscape" style={[st.page, { paddingHorizontal: 40 }]}>
        <HeaderBar />
        <WatermarkLayer label={watermark} />
        <Text style={st.eyebrow}>Dividend register · distribution statements issued</Text>
        <Text style={st.title}>Dividend register — {periodLabel(dv.period)}</Text>
        <Text style={st.subtitle}>
          Generated {statementDate(data.generatedAt)} · declared {statementDate(dv.declaredAt)} · paid {statementDay(dv.paidAt)} · {pct(dv.frankingPct)} franked ·
          corporate tax rate for imputation {taxRateLabel(dv.companyTaxRate, data.entity.isBaseRateEntity)} · A${dv.perShareAud.toFixed(6)} per share
        </Text>

        <EntityBlock entity={data.entity} />

        <View style={st.tr} wrap={false}>
          {COLS.map((c) => (
            <View key={c.key} style={[st.th, { width: c.width }, c.right ? st.tdRight : {}]}><Text>{c.label}</Text></View>
          ))}
        </View>
        {data.rows.length === 0 ? (
          <View style={st.tr}><View style={[st.td, { width: "100%" }]}><Text>No statements have been issued for this dividend yet.</Text></View></View>
        ) : null}
        {data.rows.map((r, i) => {
          const voided = r.status === "voided";
          const dim = voided ? { color: C.ink400 } : {};
          return (
            <View key={`${r.statementNo ?? "none"}-${i}`} style={st.tr} wrap={false}>
              <View style={cell("13%", false, dim)}><Text>{r.statementNo ?? "—"}{voided ? " (VOID)" : ""}</Text></View>
              <View style={cell("21%", false, dim)}><Text>{r.shareholder} · {r.role}{r.tfnOnFile ? "" : " · no TFN"}</Text></View>
              <View style={cell("9%", true, dim)}><Text>{r.sharesHeld.toLocaleString("en-AU")}</Text></View>
              <View style={cell("10%", true, dim)}><Text>{formatAudCents(r.grossAud)}</Text></View>
              <View style={cell("10%", true, dim)}><Text>{formatAudCents(r.frankedAud)}</Text></View>
              <View style={cell("9%", true, dim)}><Text>{formatAudCents(r.unfrankedAud)}</Text></View>
              <View style={cell("10%", true, dim)}><Text>{formatAudCents(r.frankingCreditAud)}</Text></View>
              <View style={cell("9%", true, dim)}><Text>{formatAudCents(r.tfnWithheldAud)}</Text></View>
              <View style={cell("9%", true, dim)}><Text>{formatAudCents(r.netPaidAud)}</Text></View>
            </View>
          );
        })}
        <View style={st.tr} wrap={false}>
          <View style={cell("13%", false, st.total)}><Text>Totals</Text></View>
          <View style={cell("21%", false, st.total)}><Text>{t.statementsIssued} issued{t.statementsVoided ? ` · ${t.statementsVoided} voided` : ""}</Text></View>
          <View style={cell("9%", true, st.total)}><Text>{t.sharesHeld.toLocaleString("en-AU")}</Text></View>
          <View style={cell("10%", true, st.total)}><Text>{formatAudCents(t.grossAud)}</Text></View>
          <View style={cell("10%", true, st.total)}><Text>{formatAudCents(t.frankedAud)}</Text></View>
          <View style={cell("9%", true, st.total)}><Text>{formatAudCents(t.unfrankedAud)}</Text></View>
          <View style={cell("10%", true, st.total)}><Text>{formatAudCents(t.frankingCreditAud)}</Text></View>
          <View style={cell("9%", true, st.total)}><Text>{formatAudCents(t.tfnWithheldAud)}</Text></View>
          <View style={cell("9%", true, st.total)}><Text>{formatAudCents(t.netPaidAud)}</Text></View>
        </View>

        <View style={[st.row, { marginTop: 8 }]}>
          <KV label="Total dividend declared" value={formatAudCents(dv.totalDividendAud)} width="25%" />
          <KV label="Total on issued statements" value={formatAudCents(t.grossAud)} width="25%" />
          <KV label="Reconciliation" value={data.reconciled ? "Reconciled" : `Variance ${formatAudCents(data.varianceAud)}`} width="25%" />
          <KV label="Total franking credits" value={formatAudCents(t.frankingCreditAud)} width="25%" />
        </View>
        {!data.reconciled ? (
          <Text style={[st.small, { color: C.amber700, marginTop: 4 }]}>
            The issued statements do not add up to the declared total — issue the missing statements or void the extra ones before filing.
          </Text>
        ) : null}

        <Text style={st.disclaimer}>{DIVIDEND_STATEMENT_DISCLAIMER}</Text>
        <Footer brandText={`${data.entity.name} · Dividend register ${periodLabel(dv.period)}`} />
      </Page>
    </Document>
  );
}

export async function renderDividendRegisterPdf(props: DividendRegisterPdfProps): Promise<Buffer> {
  return renderToBuffer(<DividendRegisterPDF {...props} />);
}
