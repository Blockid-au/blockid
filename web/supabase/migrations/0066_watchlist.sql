-- Watchlist (T_SVI_EXC_0001, v2.18) — investor bookmarks of startup tickers.
-- One row per (user, ticker). Cascade-delete with the user.

create table if not exists watchlist (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references app_users(id) on delete cascade,
  ticker text not null,
  slug text,                              -- latest analysis slug at add time
  notes text,
  created_at timestamptz not null default now(),
  unique (account_id, ticker)
);

create index if not exists watchlist_account_idx on watchlist(account_id);
create index if not exists watchlist_ticker_idx on watchlist(ticker);
