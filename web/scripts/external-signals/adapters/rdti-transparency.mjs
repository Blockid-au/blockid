// adapters/rdti-transparency.mjs — ATO R&D Tax Incentive transparency
// report ("Report of data about Research and Development tax incentive
// entities", data.gov.au, CC BY 2.5 AU).
//
// The ATO publishes an .xlsx (≈ 0.7 MB, ≈ 13,000 rows/year): Company name ·
// ABN/ACN · Total R&D expenditure (notional deductions less feedstock
// adjustments) $ · Total amended R&D expenditure $ · Income Year. Convert to
// CSV first (scripts/external-signals/xlsx-to-csv.py, or `--fetch` which does
// it) — this adapter reads the CSV. A 9-digit ACN (no ABN) is kept with
// match_confidence "low" and entity_abn null.
//
// signal_type "rdti_registration" · as_of = income-year end (30 June) ·
// value = the register's own figures. The report engine turns the figure
// into a BAND; nothing here derives a number.

import { finaliseRow, incomeYearEnd, normalizeAbn, normalizeAcn, parseCsv, pickValue, readAll, toNumber, validateAbnChecksum } from "../lib.mjs";

export const sourceId = "rdti-transparency";
export const licence = "CC BY 2.5 AU";
export const url = "https://data.gov.au/data/dataset/research-and-development-tax-incentive";
export const format = "csv";
export const ckanPackage = "research-and-development-tax-incentive";
export const requiresAllowSet = false;

const COL = {
  name: ["Company name", "Company Name", "Entity name", "Name"],
  id: ["ABN/ACN", "ABN", "ABN or ACN", "ACN"],
  spend: ["Total R&D expenditure (notional deductions less feedstock adjustments) $", "Total R&D expenditure", "Total RD expenditure", "R&D expenditure", "Total notional deductions"],
  amended: ["Total amended R&D expenditure (notional deductions less feedstock adjustments) $", "Total amended R&D expenditure", "Amended R&D expenditure"],
  year: ["Income Year", "Income year", "Year", "Financial year"],
};

export function parseRow(row) {
  const idRaw = pickValue(row, COL.id);
  const abn = normalizeAbn(idRaw);
  const acn = abn ? null : normalizeAcn(idRaw);
  if (abn && !validateAbnChecksum(abn)) return { skip: "bad_abn" };
  if (!abn && !acn) return { skip: "no_id" };
  const year = pickValue(row, COL.year);
  const asOf = incomeYearEnd(year);
  if (!asOf) return { skip: "no_year" };
  const spend = toNumber(pickValue(row, COL.spend));
  const amended = toNumber(pickValue(row, COL.amended));
  const name = pickValue(row, COL.name);
  return finaliseRow({
    source_id: sourceId,
    entity_abn: abn,
    entity_acn: acn,
    entity_name: name,
    signal_type: "rdti_registration",
    as_of: asOf,
    source_url: url,
    match_confidence: abn ? "high" : "low",
    value: {
      company_name: name,
      abn_or_acn: idRaw,
      rd_expenditure_aud: spend,
      amended_rd_expenditure_aud: amended,
      income_year: String(year).trim(),
    },
  });
}

export async function parse(input, { limit = null } = {}) {
  const text = await readAll(input);
  const csv = parseCsv(text);
  const rows = [];
  const skipped = {};
  let parsed = 0;
  for (const r of csv) {
    if (limit && parsed >= limit) break;
    parsed += 1;
    const out = parseRow(r);
    if (out.skip) skipped[out.skip] = (skipped[out.skip] ?? 0) + 1;
    else rows.push(out);
  }
  return { rows, parsed, skipped };
}
