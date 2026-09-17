// adapters/business-gov-grants.mjs — Australian Government grant awards
// (GrantConnect, grants.gov.au — where business.gov.au programs such as
// Accelerating Commercialisation / Industry Growth Program publish every
// award; CC BY 3.0 AU).
//
// Input: the GrantConnect "Grant Award" CSV export (or any recipients CSV
// that carries a recipient name + ABN + amount + date — the columns are
// resolved by alias, so state-government recipient lists parse too).
// Rows without a checksum-valid ABN are skipped (counted as `no_abn`);
// nothing is matched on name alone.
//
// signal_type "grant_award" · as_of = approval date (publish date as the
// fallback) · value = the export's own fields.

import { finaliseRow, normalizeAbn, parseCsv, pickValue, readAll, toIsoDate, toNumber, validateAbnChecksum } from "../lib.mjs";

export const sourceId = "business-gov-grants";
export const licence = "CC BY 3.0 AU";
export const url = "https://www.grants.gov.au/Ga/List";
export const format = "csv";
export const requiresAllowSet = false;

const COL = {
  gaId: ["GA ID", "GA Id", "Grant Award ID", "Reference", "Internal Reference ID"],
  agency: ["Agency", "Agency Name", "Department", "Funding body"],
  approval: ["Approval Date", "Approved", "Date Approved", "Date", "Announcement date", "Announced"],
  publish: ["Publish Date", "Published", "Date Published"],
  amount: ["Value (AUD)", "Value AUD", "Value", "Amount", "Grant Amount", "Funding Amount", "Amount (AUD)", "Total Amount", "Grant value"],
  program: ["Grant Program", "Program", "Grant program name", "Program Name", "Grant"],
  activity: ["Grant Activity", "Activity", "Project Title", "Project"],
  purpose: ["Purpose", "Description", "Project Description"],
  category: ["Category", "Grant Category"],
  recipient: ["Recipient Name", "Recipient", "Grant Recipient", "Organisation", "Organisation Name", "Business Name", "Applicant", "Company"],
  abn: ["Recipient ABN", "ABN", "ABN/ACN", "Recipient ABN/ACN", "Organisation ABN"],
  state: ["Grant Recipient Location State", "State", "Recipient State", "Location State", "State/Territory"],
  postcode: ["Grant Recipient Location Postcode", "Postcode", "Recipient Postcode"],
  term: ["Grant Term", "Term"],
  selection: ["Selection Process", "Selection process"],
};

/** One CSV row → an external_signals row, or { skip: reason }. */
export function parseRow(row) {
  const abnRaw = pickValue(row, COL.abn);
  const abn = normalizeAbn(abnRaw);
  if (!abn || !validateAbnChecksum(abn)) return { skip: "no_abn" };
  const approval = toIsoDate(pickValue(row, COL.approval));
  const publish = toIsoDate(pickValue(row, COL.publish));
  const asOf = approval ?? publish;
  if (!asOf) return { skip: "no_date" };
  const amount = toNumber(pickValue(row, COL.amount));
  const gaId = pickValue(row, COL.gaId);
  const recipient = pickValue(row, COL.recipient);
  const purpose = pickValue(row, COL.purpose);
  return finaliseRow({
    source_id: sourceId,
    entity_abn: abn,
    entity_acn: null,
    entity_name: recipient,
    signal_type: "grant_award",
    as_of: asOf,
    source_url: gaId ? `https://www.grants.gov.au/Ga/List?search=${encodeURIComponent(gaId)}` : url,
    match_confidence: "high",
    value: {
      ga_id: gaId,
      agency: pickValue(row, COL.agency),
      program: pickValue(row, COL.program),
      activity: pickValue(row, COL.activity),
      category: pickValue(row, COL.category),
      purpose: purpose ? String(purpose).slice(0, 300) : null,
      amount_aud: amount,
      approval_date: approval,
      publish_date: publish,
      grant_term: pickValue(row, COL.term),
      selection_process: pickValue(row, COL.selection),
      recipient_name: recipient,
      state: (pickValue(row, COL.state) || "").toUpperCase() || null,
      postcode: pickValue(row, COL.postcode),
    },
  });
}

/** Whole-file parse (the export is tens of MB at most). Returns { rows, parsed, skipped }. */
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
