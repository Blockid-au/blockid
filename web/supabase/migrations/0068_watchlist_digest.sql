-- Watchlist digest snapshots (T_SVI_EXC_0004, v2.18) — stores the last-sent
-- digest baseline so the next cron only emails on movement ≥5 SVI or stage shift.

alter table watchlist
  add column if not exists last_digest_svi numeric,
  add column if not exists last_digest_stage int,
  add column if not exists last_digest_at timestamptz;
