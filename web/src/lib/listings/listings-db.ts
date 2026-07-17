// Listings DB — server-only data access for the public AU Startup Index.
//
// Wraps the `v_startup_listing_public` view + the underlying `startup_listings`
// table + the `generate_ticker` RPC. Every function is null-safe: if
// `getSupabaseAdmin()` returns null (dev environment without Supabase
// credentials, or a legacy install without the 0082 migration applied), we
// degrade to an empty result rather than throwing.
//
// All read paths hit the view so we transparently pick up the latest
// `svi_index_snapshots` join and never leak PII columns from the base table.

import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Types — mirror the columns emitted by `v_startup_listing_public`.
// ---------------------------------------------------------------------------

export type Ticker = string;

export interface Listing {
  ticker: Ticker;
  name: string;
  sector: string | null;
  stage: string | null;
  hq_state: string | null;
  website_url: string | null;
  one_liner: string | null;
  svi_grade: string | null;
  svi_score: number | null;
  latest_raise_aud_cents: number | null;
  listed_at: string;
  updated_at: string;
  // svi_snapshot_date removed in view MVP (T-1305 restores it);
}

export interface GetPublicListingsOpts {
  limit?: number;
  sector?: string;
  sortBy?: "recent" | "svi_score" | "raise";
}

export interface ListingPayload {
  name: string;
  sector?: string | null;
  stage?: string | null;
  hq_state?: string | null;
  website_url?: string | null;
  one_liner?: string | null;
  svi_grade?: string | null;
  svi_score?: number | null;
  latest_raise_aud_cents?: number | null;
  is_public?: boolean;
}

// The view schema table constant — keep in one place so future rename is a
// single-line diff.
const VIEW = "v_startup_listing_public";
const TABLE = "startup_listings";

// ---------------------------------------------------------------------------
// getPublicListings — indexable list view. Filters/sort applied server-side
// so the SEO surface always renders the correct slice with real rows.
// ---------------------------------------------------------------------------

export async function getPublicListings(
  opts: GetPublicListingsOpts = {},
): Promise<Listing[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const limit = Math.max(1, Math.min(opts.limit ?? 50, 200));

  let query = supabase
    .from(VIEW)
    .select(
      [
        "ticker",
        "name",
        "sector",
        "stage",
        "hq_state",
        "website_url",
        "one_liner",
        "svi_grade",
        "svi_score",
        "latest_raise_aud_cents",
        "listed_at",
        "updated_at",
      ].join(","),
    );

  if (opts.sector) {
    query = query.eq("sector", opts.sector);
  }

  const sortBy = opts.sortBy ?? "recent";
  switch (sortBy) {
    case "svi_score":
      query = query
        .order("svi_score", { ascending: false, nullsFirst: false })
        .order("listed_at", { ascending: false });
      break;
    case "raise":
      query = query
        .order("latest_raise_aud_cents", { ascending: false, nullsFirst: false })
        .order("listed_at", { ascending: false });
      break;
    case "recent":
    default:
      query = query.order("listed_at", { ascending: false });
      break;
  }

  const { data, error } = await query.limit(limit);

  if (error) {
    // Missing view / table = graceful empty list; anything else, log + degrade.
    if (!/relation.*(v_startup_listing_public|startup_listings).*does not exist/i.test(error.message ?? "")) {
      console.error("[blockid:listings-db] getPublicListings failed", error);
    }
    return [];
  }
  return (data as unknown as Listing[] | null) ?? [];
}

// ---------------------------------------------------------------------------
// getListingByTicker — detail read; view enforces is_public = true.
// ---------------------------------------------------------------------------

export async function getListingByTicker(ticker: string): Promise<Listing | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const normalised = ticker.trim().toUpperCase();
  if (!/^[A-Z0-9]{3,8}(-[0-9]+)?$/.test(normalised)) return null;

  const { data, error } = await supabase
    .from(VIEW)
    .select(
      [
        "ticker",
        "name",
        "sector",
        "stage",
        "hq_state",
        "website_url",
        "one_liner",
        "svi_grade",
        "svi_score",
        "latest_raise_aud_cents",
        "listed_at",
        "updated_at",
      ].join(","),
    )
    .eq("ticker", normalised)
    .maybeSingle();

  if (error) {
    if (!/relation.*(v_startup_listing_public|startup_listings).*does not exist/i.test(error.message ?? "")) {
      console.error("[blockid:listings-db] getListingByTicker failed", error);
    }
    return null;
  }
  return (data as unknown as Listing | null) ?? null;
}

// ---------------------------------------------------------------------------
// submitStartupListing — owner-scoped write. Generates the ticker via RPC
// (server-side, atomic against the current table state) then inserts the
// row with `is_public = false` by default so the founder can review before
// making it discoverable.
// ---------------------------------------------------------------------------

export async function submitStartupListing(
  userId: string,
  payload: ListingPayload,
): Promise<{ ok: true; ticker: Ticker } | { ok: false; reason: string }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, reason: "not_configured" };

  const name = (payload.name ?? "").trim();
  if (!name) return { ok: false, reason: "name_required" };

  // Generate ticker via the plpgsql function — collision-safe.
  const { data: tickerData, error: tickerErr } = await supabase.rpc(
    "generate_ticker",
    { p_name: name },
  );
  if (tickerErr) {
    console.error("[blockid:listings-db] generate_ticker rpc failed", tickerErr);
    return { ok: false, reason: "ticker_generation_failed" };
  }
  const ticker = String(tickerData ?? "").trim();
  if (!ticker) return { ok: false, reason: "ticker_generation_failed" };

  const { error: insertErr } = await supabase.from(TABLE).insert({
    ticker,
    startup_id: userId,
    name,
    sector: payload.sector ?? null,
    stage: payload.stage ?? null,
    hq_state: payload.hq_state ?? null,
    website_url: payload.website_url ?? null,
    one_liner: payload.one_liner ?? null,
    svi_grade: payload.svi_grade ?? null,
    svi_score: payload.svi_score ?? null,
    latest_raise_aud_cents: payload.latest_raise_aud_cents ?? null,
    is_public: payload.is_public ?? false,
  });

  if (insertErr) {
    console.error("[blockid:listings-db] submitStartupListing insert failed", insertErr);
    return { ok: false, reason: "db_error" };
  }

  // Fire-and-forget audit event; failure here is non-fatal.
  try {
    await supabase.from("startup_listing_events").insert({
      ticker,
      kind: "list",
      detail: { source: "submitStartupListing" },
    });
  } catch (err) {
    console.error("[blockid:listings-db] event insert failed", err);
  }

  return { ok: true, ticker };
}
