// adapters/funding-announcements.mjs — Australian startup funding announcements
// (G24-B). The `funding_round` outcome signal (lib/outcomes/proposals.ts →
// `funding_raised` proposals, human-confirmed) had no feed: no open register
// publishes private rounds. This adapter ingests a BlockID-curated CSV of
// PUBLIC announcements (company press releases, investor / media reports),
// one row per announcement, each with the link it was taken from.
//
// Input: a CSV with a company name + ABN + round + amount + announcement date
// + source URL (columns resolved by alias, so an exported spreadsheet parses
// as-is). Rules — nothing is ever inferred:
//   • rows without a checksum-valid ABN are skipped (`no_abn`); no name matching;
//   • rows without an announcement date are skipped (`no_date`);
//   • rows without a positive AUD amount are skipped (`no_amount`) — the
//     proposal needs the figure and "undisclosed" is not a number;
//   • rows without an https source link are skipped (`no_source`) — every
//     stored fact must be traceable to the public page it came from.
//
// signal_type "funding_round" · as_of = announcement date · value = the
// sheet's own fields (round, amount_aud, investors, headline, announced_by).
// Licence: the compilation is BlockID's own (CC BY 4.0, external_sources row
// seeded by migration 0435); the facts link back to their published source.

import { finaliseRow, normalizeAbn, parseCsv, pickValue, readAll, toIsoDate, toNumber, validateAbnChecksum } from "../lib.mjs";

export const sourceId = "funding-announcements";
export const licence = "CC BY 4.0";
export const url = "https://blockid.au/methodology#data-sources";
export const format = "csv";
export const requiresAllowSet = false;

const COL = {
  company: ["Company", "Company Name", "Startup", "Startup Name", "Organisation", "Organisation Name", "Business Name", "Entity"],
  abn: ["ABN", "Company ABN", "ABN/ACN", "Entity ABN"],
  acn: ["ACN", "Company ACN"],
  round: ["Round", "Round Type", "Stage", "Funding Round", "Series"],
  amount: ["Amount (AUD)", "Amount AUD", "Amount", "Raised (AUD)", "Raised", "Value (AUD)", "Round Size (AUD)", "Round Size"],
  currency: ["Currency"],
  announced: ["Announced", "Announcement Date", "Announced On", "Date", "Date Announced", "Published"],
  investors: ["Investors", "Lead Investor", "Lead", "Backers", "Participants"],
  headline: ["Headline", "Title", "Article Title"],
  announcedBy: ["Announced By", "Source", "Publisher", "Outlet", "Source Name"],
  sourceUrl: ["Source URL", "URL", "Link", "Announcement URL", "Press Release URL", "Article URL"],
  state: ["State", "HQ State", "Location State", "State/Territory"],
  sector: ["Sector", "Industry", "Category"],
};

function httpsUrl(v) {
  const s = typeof v === "string" ? v.trim() : "";
  if (!/^https:\/\/[^\s"'<>]+$/i.test(s)) return null;
  return s.slice(0, 500);
}

function text(v, max = 200) {
  const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
  return s ? s.slice(0, max) : null;
}

/** One CSV row → an external_signals row, or { skip: reason }. */
export function parseRow(row) {
  const abn = normalizeAbn(pickValue(row, COL.abn));
  if (!abn || !validateAbnChecksum(abn)) return { skip: "no_abn" };
  const asOf = toIsoDate(pickValue(row, COL.announced));
  if (!asOf) return { skip: "no_date" };
  const amount = toNumber(pickValue(row, COL.amount));
  if (amount === null || !(amount > 0)) return { skip: "no_amount" };
  const currency = (text(pickValue(row, COL.currency), 3) ?? "AUD").toUpperCase();
  if (currency !== "AUD") return { skip: "not_aud" };
  const sourceUrl = httpsUrl(pickValue(row, COL.sourceUrl));
  if (!sourceUrl) return { skip: "no_source" };
  const company = text(pickValue(row, COL.company));
  const acnRaw = text(pickValue(row, COL.acn), 12);
  const acn = acnRaw ? acnRaw.replace(/\D/g, "") : "";
  return finaliseRow({
    source_id: sourceId,
    entity_abn: abn,
    entity_acn: acn.length === 9 ? acn : null,
    entity_name: company,
    signal_type: "funding_round",
    as_of: asOf,
    source_url: sourceUrl,
    match_confidence: "high",
    value: {
      round: text(pickValue(row, COL.round), 60),
      amount_aud: amount,
      currency: "AUD",
      announced_at: asOf,
      investors: text(pickValue(row, COL.investors), 300),
      headline: text(pickValue(row, COL.headline), 200),
      announced_by: text(pickValue(row, COL.announcedBy), 120),
      company_name: company,
      state: (text(pickValue(row, COL.state), 10) ?? "").toUpperCase() || null,
      sector: text(pickValue(row, COL.sector), 80),
      source_url: sourceUrl,
    },
  });
}

/** Whole-file parse (a curated sheet is small). Returns { rows, parsed, skipped }. */
export async function parse(input, { limit = null } = {}) {
  const textIn = await readAll(input);
  const csv = parseCsv(textIn);
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
