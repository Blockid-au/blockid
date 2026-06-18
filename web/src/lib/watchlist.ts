// Watchlist — investor bookmarks of startup tickers (T_SVI_EXC_0001).
//
// Anonymous tickers only; the row stores the ticker + the latest slug at add
// time so the UI can deep-link to the share page. Slug is informational —
// the canonical key is (account_id, ticker).

import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";

export interface WatchlistRow {
  id: string;
  ticker: string;
  slug: string | null;
  notes: string | null;
  created_at: string;
}

export async function listWatchlist(accountId: string): Promise<WatchlistRow[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data } = await supabase
    .from("watchlist")
    .select("id, ticker, slug, notes, created_at")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });
  return (data as WatchlistRow[] | null) ?? [];
}

export async function toggleWatchlist(args: {
  accountId: string;
  ticker: string;
  slug?: string;
  notes?: string;
}): Promise<{ added: boolean; removed: boolean; row?: WatchlistRow }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { added: false, removed: false };

  const { data: existing } = await supabase
    .from("watchlist")
    .select("id, ticker, slug, notes, created_at")
    .eq("account_id", args.accountId)
    .eq("ticker", args.ticker)
    .maybeSingle();

  if (existing) {
    await supabase.from("watchlist").delete().eq("id", (existing as { id: string }).id);
    return { added: false, removed: true };
  }

  const { data: created } = await supabase
    .from("watchlist")
    .insert({
      account_id: args.accountId,
      ticker: args.ticker,
      slug: args.slug ?? null,
      notes: args.notes ?? null,
    })
    .select("id, ticker, slug, notes, created_at")
    .single();

  return { added: true, removed: false, row: created as WatchlistRow };
}
