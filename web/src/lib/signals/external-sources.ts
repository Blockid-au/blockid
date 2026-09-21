/**
 * External data-source catalogue (G14-S40).
 *
 * The allow-list of open Australian registers the platform may bulk-ingest
 * and the commercial reports it may only CITE. Migration 0410 seeds
 * `public.external_sources` from these rows (a colocated test parses the
 * SQL and pins ids / licences / status in sync), the ingest CLI's licence
 * gate reads the table row (this catalogue only when there is no DB, i.e.
 * a fixture dry-run), and /methodology "Data sources" prints
 * `attribution_text` verbatim — from the table when it exists, from here
 * until 0410 is applied.
 *
 * Pure: no I/O.
 */

import { BRAND_SITE, LEGAL_ENTITY } from "@/lib/site/legal-entity";

export type ExternalSourceStatus = "active" | "cite_only" | "disabled";

export type ExternalSourceId =
  | "abr-bulk"
  | "business-gov-grants"
  | "rdti-transparency"
  | "funding-announcements"
  | "cut-through-venture"
  | "startup-muster"
  | "acs-digital-pulse";

export interface ExternalSourceRow {
  id: string;
  name: string;
  url: string;
  licence: string;
  attribution_text: string;
  cadence: string | null;
  last_fetched_at: string | null;
  row_count: number;
  status: ExternalSourceStatus;
}

/** Ids the ingest may ever write rows for. */
export const INGESTABLE_SOURCE_IDS: readonly ExternalSourceId[] = ["abr-bulk", "business-gov-grants", "rdti-transparency", "funding-announcements"];

/** Ids that are reference-only: reports may cite a figure with a link, never store rows. */
export const CITE_ONLY_SOURCE_IDS: readonly ExternalSourceId[] = ["cut-through-venture", "startup-muster", "acs-digital-pulse"];

export const EXTERNAL_SOURCE_CATALOG: readonly ExternalSourceRow[] = [
  {
    id: "abr-bulk",
    name: "ABN Bulk Extract (Australian Business Register)",
    url: "https://data.gov.au/data/dataset/abn-bulk-extract",
    licence: "CC BY 3.0 AU",
    attribution_text:
      "Contains ABN Bulk Extract data © Commonwealth of Australia (Australian Business Register, via data.gov.au), licensed under Creative Commons Attribution 3.0 Australia.",
    cadence: "weekly",
    last_fetched_at: null,
    row_count: 0,
    status: "active",
  },
  {
    id: "business-gov-grants",
    name: "Australian Government grant awards (GrantConnect — business.gov.au programs)",
    url: "https://www.grants.gov.au/Ga/List",
    licence: "CC BY 3.0 AU",
    attribution_text:
      "Grant award data © Commonwealth of Australia (Department of Finance, GrantConnect grants.gov.au), licensed under Creative Commons Attribution 3.0 Australia.",
    cadence: "weekly",
    last_fetched_at: null,
    row_count: 0,
    status: "active",
  },
  {
    id: "rdti-transparency",
    name: "R&D Tax Incentive transparency report (ATO)",
    url: "https://data.gov.au/data/dataset/research-and-development-tax-incentive",
    licence: "CC BY 2.5 AU",
    attribution_text:
      "Research and Development Tax Incentive entity data © Commonwealth of Australia (Australian Taxation Office, via data.gov.au), licensed under Creative Commons Attribution 2.5 Australia.",
    cadence: "annual",
    last_fetched_at: null,
    row_count: 0,
    status: "active",
  },
  {
    // G24-B: the feed for `funding_round` signals → funding_raised outcome
    // proposals. A BlockID-curated sheet of PUBLIC announcements (press
    // releases / media), every row linking its source; seeded by 0435.
    id: "funding-announcements",
    name: "Australian startup funding announcements (BlockID-curated from public press releases)",
    url: "https://blockid.au/methodology#data-sources",
    licence: "CC BY 4.0",
    attribution_text:
      `Funding announcement data compiled by ${BRAND_SITE} (© ${LEGAL_ENTITY.copyrightHolder}) from public company press releases and media reports; every row links to its published source. Compilation licensed under Creative Commons Attribution 4.0 International.`,
    cadence: "weekly",
    last_fetched_at: null,
    row_count: 0,
    status: "active",
  },
  {
    id: "cut-through-venture",
    name: "Cut Through Venture — State of Australian Startup Funding",
    url: "https://www.cutthroughventure.com/",
    licence: "All rights reserved (cite only)",
    attribution_text:
      "Figures cited from the State of Australian Startup Funding report © Cut Through Venture / Folklore Ventures. Not redistributed; each citation links to the published report.",
    cadence: "annual",
    last_fetched_at: null,
    row_count: 0,
    status: "cite_only",
  },
  {
    id: "startup-muster",
    name: "Startup Muster annual report",
    url: "https://www.startupmuster.com/",
    licence: "All rights reserved (cite only)",
    attribution_text:
      "Figures cited from the Startup Muster annual report © Startup Muster. Not redistributed; each citation links to the published report.",
    cadence: "annual",
    last_fetched_at: null,
    row_count: 0,
    status: "cite_only",
  },
  {
    id: "acs-digital-pulse",
    name: "ACS Australia's Digital Pulse",
    url: "https://www.acs.org.au/campaign/digital-pulse.html",
    licence: "All rights reserved (cite only)",
    attribution_text:
      "Figures cited from Australia's Digital Pulse © Australian Computer Society (with Deloitte Access Economics). Not redistributed; each citation links to the published report.",
    cadence: "annual",
    last_fetched_at: null,
    row_count: 0,
    status: "cite_only",
  },
];

export function catalogSource(id: string): ExternalSourceRow | null {
  return EXTERNAL_SOURCE_CATALOG.find((s) => s.id === id) ?? null;
}

/**
 * The licence gate, shared by the CLI (via lib.mjs — same rules, tested on
 * both sides) and the admin page. A source may be ingested only when its
 * row exists, its status is `active` and it carries a non-empty licence
 * that is not a cite-only marker.
 */
export function licenceGate(row: ExternalSourceRow | null | undefined): { ok: true } | { ok: false; reason: string } {
  if (!row) return { ok: false, reason: "unknown source (no external_sources row)" };
  const licence = (row.licence ?? "").trim();
  if (!licence) return { ok: false, reason: `source ${row.id} has no licence recorded` };
  if (row.status === "cite_only" || /cite[ -]only/i.test(licence)) return { ok: false, reason: `source ${row.id} is cite_only — bulk ingest refused` };
  if (row.status !== "active") return { ok: false, reason: `source ${row.id} is ${row.status}` };
  return { ok: true };
}

const DB_MISSING = new Set(["42P01", "PGRST205", "PGRST204", "PGRST202"]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from(table: string): any };

/**
 * `external_sources` rows (DB first, catalogue fallback). 42P01 / missing
 * table / no client → the catalogue, flagged `fromDb: false`, so /methodology
 * always lists the six sources.
 */
export async function loadExternalSources(db: Db | null | undefined): Promise<{ rows: ExternalSourceRow[]; fromDb: boolean; error: string | null }> {
  const fallback = { rows: [...EXTERNAL_SOURCE_CATALOG], fromDb: false };
  if (!db) return { ...fallback, error: "no db" };
  try {
    const { data, error } = await db.from("external_sources").select("id,name,url,licence,attribution_text,cadence,last_fetched_at,row_count,status").order("status").order("id");
    if (error) return { ...fallback, error: DB_MISSING.has(String(error.code)) ? "table missing (apply 0410)" : String(error.message ?? error.code) };
    const rows = (data ?? []) as ExternalSourceRow[];
    if (!rows.length) return { ...fallback, error: "table empty" };
    // Catalogue first (stable public order: ingestable, then cite-only), unknown ids after.
    const order = new Map(EXTERNAL_SOURCE_CATALOG.map((s, i) => [s.id, i] as const));
    rows.sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99) || a.id.localeCompare(b.id));
    return { rows, fromDb: true, error: null };
  } catch (e) {
    return { ...fallback, error: e instanceof Error ? e.message : String(e) };
  }
}
