/**
 * Shareholder annual tax statement PDF (S28-A) — one A4 document per
 * shareholder per financial year, rendered from the payload frozen on
 * `shareholder_tax_statements.payload` (migration 0372), never a recompute.
 *
 *   Entity block   the FOUNDER's company as entered on the project — name,
 *                  ACN / ABN (or "not supplied"), address when known.
 *                  BlockID's own entity is never printed as the payer.
 *   Statement      number `TS-<FY>-<n>`, date made, the FY (1 July – 30 June).
 *   Shareholder    name, role, share class, holding, TFN quoted.
 *   Annual totals  franked / unfranked dividends, franking credits, TFN
 *                  withheld, net cash, grossed-up (assessable) amount, the
 *                  number of distributions, DRIP shares.
 *   Distributions  one row per distribution statement with the payment date.
 *   Notes          the "may be reported to the ATO / include the franking
 *                  credits as assessable income and claim the offset"
 *                  wording — general information, not tax advice.
 *   Footer         BlockID not-tax-advice disclaimer; the S21-A watermark
 *                  when a label is given; SUPERSEDED banner for an old version.
 */

import { Document, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { C, Footer, HeaderBar } from "./svi-report-pdf";
import { WatermarkLayer } from "./watermark";
import { EntityBlock, KV, pct, st, statementDate, statementDay } from "./dividend-statement-pdf";
import { formatAudCents } from "@/lib/dividends/statement";
import type { ShareholderTaxStatementPayload } from "@/lib/dividends/fy-summary";

/** Not-tax-advice footer — names BlockID.au as the tool only; the reporting entity is the founder's company on the page. */
export const TAX_STATEMENT_DISCLAIMER =
  "This annual tax statement was prepared with BlockID.au from the distribution statements, cap table and company details entered by the paying company, which is solely responsible for its accuracy. " +
  "BlockID.au is not the paying entity, is not a registered tax agent and does not hold an Australian Financial Services Licence (AFSL). " +
  "This document is general information only — not tax, legal, accounting or personal financial product advice under s766B of the Corporations Act 2001 (Cth). " +
  "Confirm the amounts, the franking credit offset and any ATO reporting obligations with a registered tax agent before lodging.";

export interface ShareholderTaxStatementPdfProps {
  data: ShareholderTaxStatementPayload;
  /** `blockid:v1:<hex>` — printed in full at the foot of the page. */
  contentHash: string;
  /** From `watermarkLabel()`; null → clean page. */
  watermark: string | null;
  /** Version number printed on the page (1 when unset). */
  version?: number | null;
  /** Set when a later version replaced this one — a banner is printed. */
  supersededAt?: string | null;
}

function AmountRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={st.tr} wrap={false}>
      <View style={[st.td, { width: "62%" }, bold ? st.total : {}]}><Text>{label}</Text></View>
      <View style={[st.td, st.tdRight, { width: "38%" }, bold ? st.total : {}]}><Text>{value}</Text></View>
    </View>
  );
}

const COLS: Array<{ key: "paidAt" | "statementNo" | "frankedAud" | "unfrankedAud" | "frankingCreditAud" | "tfnWithheldAud" | "netPaidAud"; label: string; width: string; right?: boolean }> = [
  { key: "paidAt", label: "Date paid", width: "14%" },
  { key: "statementNo", label: "Statement", width: "18%" },
  { key: "frankedAud", label: "Franked", width: "14%", right: true },
  { key: "unfrankedAud", label: "Unfranked", width: "14%", right: true },
  { key: "frankingCreditAud", label: "Franking credit", width: "14%", right: true },
  { key: "tfnWithheldAud", label: "TFN withheld", width: "12%", right: true },
  { key: "netPaidAud", label: "Net paid", width: "14%", right: true },
];

export function fyRangeLabel(fy: ShareholderTaxStatementPayload["fy"]): string {
  return `1 July ${fy.startYear} – 30 June ${fy.endYear}`;
}

export function ShareholderTaxStatementPDF({ data, contentHash, watermark, version, supersededAt }: ShareholderTaxStatementPdfProps) {
  const t = data.totals;
  const sh = data.shareholder;
  const v = Number.isFinite(Number(version)) && Number(version) >= 1 ? Math.floor(Number(version)) : 1;
  return (
    <Document title={`Annual tax statement ${data.statementNo} — ${sh.name}`} author={data.entity.name} subject={`Shareholder annual tax statement FY ${data.fy.label}`} creator="BlockID.au">
      <Page size="A4" style={st.page}>
        <HeaderBar />
        <WatermarkLayer label={watermark} />
        {supersededAt ? (
          <Text style={st.voided} fixed>
            SUPERSEDED — version {v} of this statement was replaced on {statementDate(supersededAt)}; use the current version.
          </Text>
        ) : null}

        <Text style={st.eyebrow}>Shareholder annual tax statement</Text>
        <Text style={st.title}>Annual dividend statement {data.fy.label}</Text>
        <Text style={st.subtitle}>
          Statement {data.statementNo} · version {v} · made {statementDate(data.statementDate)} · financial year {fyRangeLabel(data.fy)}
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
            <KV label="Shares held (at last distribution)" value={sh.sharesHeld.toLocaleString("en-AU")} width="40%" />
            <KV label="Distributions in the year" value={String(t.distributions)} width="20%" />
            <KV label="DRIP shares allotted" value={t.dripShares.toLocaleString("en-AU")} width="20%" />
            <KV label="Financial year" value={data.fy.label} width="20%" />
          </View>
        </View>

        <Text style={st.h2}>Annual totals (AUD)</Text>
        <View style={st.tr} wrap={false}>
          <View style={[st.th, { width: "62%" }]}><Text>Item</Text></View>
          <View style={[st.th, st.tdRight, { width: "38%" }]}><Text>Amount</Text></View>
        </View>
        <AmountRow label="Total dividends paid (gross)" value={formatAudCents(t.grossAud)} />
        <AmountRow label="Total franked dividends" value={formatAudCents(t.frankedAud)} />
        <AmountRow label="Total unfranked dividends" value={formatAudCents(t.unfrankedAud)} />
        <AmountRow label="Total franking credits" value={formatAudCents(t.frankingCreditAud)} />
        <AmountRow label="Total TFN amounts withheld" value={formatAudCents(t.tfnWithheldAud)} />
        <AmountRow label="Net cash paid to shareholder" value={formatAudCents(t.netPaidAud)} bold />
        <AmountRow label="Grossed-up (assessable) amount = dividends + franking credits" value={formatAudCents(t.grossedUpAud)} bold />
        {t.dripShares > 0 ? <AmountRow label={`Of which reinvested under the DRIP (${t.dripShares.toLocaleString("en-AU")} shares)`} value={formatAudCents(t.dripReinvestedAud)} /> : null}

        <Text style={st.h2}>Distributions in the year</Text>
        <View style={st.tr} wrap={false}>
          {COLS.map((c) => (
            <View key={c.key} style={[st.th, { width: c.width }, c.right ? st.tdRight : {}]}>
              <Text>{c.label}</Text>
            </View>
          ))}
        </View>
        {data.distributions.map((d, i) => (
          <View key={`${d.statementNo}-${i}`} style={st.tr} wrap={false}>
            {COLS.map((c) => {
              const raw = d[c.key];
              const value = c.key === "paidAt" ? statementDay(String(raw)) : c.key === "statementNo" ? `${String(raw)} (${pct(d.frankingPct)} franked)` : formatAudCents(Number(raw));
              return (
                <View key={c.key} style={[st.td, { width: c.width }, c.right ? st.tdRight : {}]}>
                  <Text>{value}</Text>
                </View>
              );
            })}
          </View>
        ))}
        {data.distributions.length === 0 ? (
          <Text style={[st.small, { marginTop: 4 }]}>No distribution was paid to this shareholder in the financial year.</Text>
        ) : null}

        <Text style={st.h2}>Notes</Text>
        {data.notes.map((line, i) => (
          <View key={i} style={st.bulletRow}>
            <Text style={st.bulletDot}>•</Text>
            <Text style={st.bulletText}>{line}</Text>
          </View>
        ))}
        {!data.reconciled ? (
          <Text style={[st.small, { color: C.amber700, marginTop: 4 }]}>Rounding check: the parts of this statement do not re-add to the cent — review before sending.</Text>
        ) : null}

        <Text style={st.disclaimer}>{TAX_STATEMENT_DISCLAIMER}</Text>
        <Text style={[st.small, { marginTop: 6 }]}>
          Statement {data.statementNo} · format {data.version} · content hash (SHA-256 of the canonical statement payload):
        </Text>
        <Text style={st.mono}>{contentHash}</Text>
        <Footer brandText={`${data.entity.name} · Annual tax statement ${data.statementNo}`} />
      </Page>
    </Document>
  );
}

/** Render to bytes — what the PDF route and the data-room save use. */
export async function renderShareholderTaxStatementPdf(props: ShareholderTaxStatementPdfProps): Promise<Buffer> {
  return renderToBuffer(<ShareholderTaxStatementPDF {...props} />);
}
