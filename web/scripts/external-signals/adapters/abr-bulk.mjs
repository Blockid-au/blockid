// adapters/abr-bulk.mjs — ABN Bulk Extract (data.gov.au, CC BY 3.0 AU).
//
// The extract is ~20 XML files (public_split_*_*.zip → *.xml, ~2 GB
// unpacked). Each <ABR …>…</ABR> record sits on its own line. This adapter
// STREAM-parses (a carry buffer across chunk boundaries, regex per record —
// the same fields blipk/ABNBulkExtract extracts) and keeps ONLY records
// whose ABN is in the allow-set (projects.abn ∪ public index ∪ grant
// profiles ∪ ABNs already on the register tables ∪ --abn-file). Nothing
// else is retained in memory or written.
//
// signal_type "abr_entity" · as_of = recordLastUpdatedDate · value = the
// record's own fields (status, dates, entity type, name, state/postcode,
// ACN, GST) — never anything derived.

import { finaliseRow, normalizeAbn, normalizeAcn, toChunks, toIsoDate } from "../lib.mjs";

export const sourceId = "abr-bulk";
export const licence = "CC BY 3.0 AU";
export const url = "https://data.gov.au/data/dataset/abn-bulk-extract";
export const format = "xml";
/** CKAN package id — `--fetch` lists its zip resources through the API. */
export const ckanPackage = "abn-bulk-extract";
/** ABR bulk needs the allow-set; the CLI refuses to run it without one. */
export const requiresAllowSet = true;

const AMP = String.fromCharCode(38);
const ENTITIES = { amp: AMP, lt: "<", gt: ">", quot: String.fromCharCode(34), apos: String.fromCharCode(39) };

function unescapeXml(s) {
  return String(s ?? "").replace(/&(amp|lt|gt|quot|apos);/g, (_, k) => ENTITIES[k] ?? _);
}

const attr = (rec, re) => {
  const m = rec.match(re);
  return m ? m[1] : null;
};

/** One <ABR> record → an external_signals row (or null when there is no ABN). */
export function parseRecord(rec, opts = {}) {
  const abnM = rec.match(/<ABN status="(\w{3})" ABNStatusFromDate="(\d{8})">(\d{0,20})/);
  if (!abnM) return null;
  const abn = normalizeAbn(abnM[3]);
  if (!abn) return null;
  const lastUpdated = attr(rec, /<ABR recordLastUpdatedDate="(\d{8})"/);
  const replaced = attr(rec, /<ABR [^>]*replaced="(\w)"/);
  const entityTypeCode = attr(rec, /<EntityTypeInd>(\w{0,4})/);
  const entityType = unescapeXml(attr(rec, /<EntityTypeText>([^<]{0,120})/));
  const main = rec.match(/<MainEntity>(.*?)<\/MainEntity>/);
  const legal = rec.match(/<LegalEntity>(.*?)<\/LegalEntity>/);
  const entity = main ? main[1] : legal ? legal[1] : "";
  let name = null;
  if (main) {
    name = unescapeXml(attr(entity, /<NonIndividualNameText>([^<]*)<\/NonIndividualNameText>/));
  } else if (legal) {
    // Sole traders: the register publishes the individual name. We keep only
    // the family name + initial (the ABN is the key; the person is not the
    // signal) unless opts.fullIndividualNames is set.
    const given = attr(entity, /<GivenName>([^<]*)</);
    const family = attr(entity, /<FamilyName>([^<]*)</);
    name = opts.fullIndividualNames ? [given, family].filter(Boolean).join(" ") : [given ? `${given[0]}.` : null, family].filter(Boolean).join(" ");
    name = unescapeXml(name) || null;
  }
  const state = attr(entity, /<State>(\w{0,3})/);
  const postcode = attr(entity, /<Postcode>(\d{0,4})/);
  const asic = rec.match(/<ASICNumber ASICNumberType="(\w{0,40})">(\d{9})/);
  const gst = rec.match(/<GST status="(\w{0,3})" GSTStatusFromDate="(\d{8})"/);
  const dgr = rec.match(/<DGR DGRStatusFromDate="(\d{8})?"/);
  const asOf = toIsoDate(lastUpdated) ?? toIsoDate(abnM[2]);
  if (!asOf) return null;
  return finaliseRow({
    source_id: sourceId,
    entity_abn: abn,
    entity_acn: asic ? normalizeAcn(asic[2]) : null,
    entity_name: name,
    signal_type: "abr_entity",
    as_of: asOf,
    source_url: `https://abr.business.gov.au/ABN/View?abn=${abn}`,
    match_confidence: "high",
    value: {
      abn_status: abnM[1],
      abn_status_from: toIsoDate(abnM[2]),
      entity_type_code: entityTypeCode,
      entity_type: entityType || null,
      legal_name: name,
      individual: Boolean(legal && !main),
      state,
      postcode,
      acn: asic ? normalizeAcn(asic[2]) : null,
      asic_number_type: asic ? asic[1] : null,
      gst_status: gst ? gst[1] : null,
      gst_from: gst ? toIsoDate(gst[2]) : null,
      dgr_from: dgr && dgr[1] ? toIsoDate(dgr[1]) : null,
      record_last_updated: toIsoDate(lastUpdated),
      replaced: replaced === "Y",
    },
  });
}

/**
 * Stream-parse the XML. `input` = string | Buffer | Readable. Yields rows for
 * ABNs in `keep` (a Set; required — an empty set keeps nothing). `limit`
 * stops after N parsed records (allow-set filtering happens before the
 * limit so a smoke run still finds allow-listed rows).
 */
export async function* parseStream(input, { keep, limit = null, onRecord = null } = {}) {
  if (!(keep instanceof Set)) throw new Error("abr-bulk needs an allow-set (Set of ABNs)");
  let carry = "";
  let seen = 0;
  const OPEN = "<ABR ";
  const CLOSE = "</ABR>";
  for await (const chunk of toChunks(input)) {
    carry += chunk;
    // Scan by offset; slice the buffer ONCE per chunk (not per record) so a
    // 1 MB chunk with ~1,000 records stays linear.
    let pos = 0;
    let done = false;
    for (;;) {
      const start = carry.indexOf(OPEN, pos);
      if (start === -1) {
        // No record start ahead — keep only a small tail in case "<AB" straddles the boundary.
        pos = Math.max(pos, carry.length - 64);
        break;
      }
      const end = carry.indexOf(CLOSE, start);
      if (end === -1) {
        pos = start; // incomplete record — wait for the next chunk
        break;
      }
      const rec = carry.slice(start, end + CLOSE.length);
      pos = end + CLOSE.length;
      seen += 1;
      if (onRecord) onRecord(seen);
      // Cheap pre-filter: only regex the record when its ABN is wanted.
      const abnM = rec.match(/<ABN [^>]*>(\d{11})/);
      if (abnM && keep.has(abnM[1])) {
        const row = parseRecord(rec);
        if (row) yield row;
      }
      if (limit && seen >= limit) {
        done = true;
        break;
      }
    }
    if (done) return;
    carry = carry.slice(pos);
  }
}

/** Collect helper for the CLI / tests. Returns { rows, parsed }. */
export async function parse(input, opts = {}) {
  const rows = [];
  let parsed = 0;
  for await (const row of parseStream(input, { ...opts, onRecord: (n) => (parsed = n) })) rows.push(row);
  return { rows, parsed };
}
