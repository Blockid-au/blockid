-- 0366_secondary_sim.sql
-- ---------------------------------------------------------------------------
-- S27-B — pre-IPO secondary trading SANDBOX (order book simulation).
--
-- Why
--   /workspace/secondary-offer collects a draft intent only. Founders asked
--   what their tokenised shares "would trade at" before any real secondary
--   process — a question the platform must answer WITHOUT offering or
--   transferring a security. This is a clearly-labelled sandbox: a limit
--   order book over the project's cap table, matched by
--   lib/secondary/order-book.ts (price-time priority, partial fills, no
--   shorting, self-trade prevention, optional ROFR hold). Nothing here is an
--   offer under Chapter 6D / Chapter 7 of the Corporations Act 2001 (Cth);
--   every API response carries `sandbox: true`.
--
-- What
--   secondary_sim_settings  one row per project: whether the shareholders'
--                           agreement ROFR is enforced in the sandbox (a
--                           48 h hold on new sells) — the platform has no
--                           SHA/ROFR field elsewhere, so this IS the setting.
--   secondary_sim_orders    limit orders. `user_id` = who placed it (owner or
--                           an accepted editor/admin; FK app_users CASCADE →
--                           erasure map mode `delete`, 127th FK). `holder_key`
--                           is the sandbox identity the order trades AS:
--                           `sh:<shareholders.id>` for a register holder or
--                           `sb:<label>` for an invited sandbox buyer.
--                           `seq` (bigserial) is the time-priority key.
--   secondary_sim_trades    fills. Order refs are ON DELETE SET NULL so the
--                           tape survives an erased placer (the labels stay —
--                           they are register names / free-text sandbox
--                           labels, not account PII).
--
-- RLS
--   Enabled on all three. Owner may SELECT their project's rows via
--   projects.user_id; writes go through the service role from
--   /api/secondary/sim/* which resolve member roles via project_members.
--
-- Apply (self-hosted Supabase; migrations are NOT applied on deploy):
--   scripts/db/apply-migration.sh web/supabase/migrations/0366_secondary_sim.sql
-- Then apply 0368 (erase_account() re-created for the new app_users FK).
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── settings ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.secondary_sim_settings (
  project_id       UUID        PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  rofr_enabled     BOOLEAN     NOT NULL DEFAULT false,
  rofr_hold_hours  INTEGER     NOT NULL DEFAULT 48 CHECK (rofr_hold_hours BETWEEN 1 AND 720),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.secondary_sim_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS secondary_sim_settings_owner_select ON public.secondary_sim_settings;
CREATE POLICY secondary_sim_settings_owner_select ON public.secondary_sim_settings
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = secondary_sim_settings.project_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS secondary_sim_settings_service_all ON public.secondary_sim_settings;
CREATE POLICY secondary_sim_settings_service_all ON public.secondary_sim_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── orders ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.secondary_sim_orders (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID          NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id         UUID          NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  shareholder_id  UUID          REFERENCES public.shareholders(id) ON DELETE SET NULL,
  holder_key      TEXT          NOT NULL CHECK (holder_key ~ '^(sh|sb):.{1,120}$'),
  holder_label    TEXT          NOT NULL CHECK (length(holder_label) BETWEEN 1 AND 120),
  side            TEXT          NOT NULL CHECK (side IN ('buy', 'sell')),
  price_aud       NUMERIC(14,4) NOT NULL CHECK (price_aud > 0),
  qty             BIGINT        NOT NULL CHECK (qty > 0),
  remaining       BIGINT        NOT NULL CHECK (remaining >= 0 AND remaining <= qty),
  status          TEXT          NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'held', 'filled', 'cancelled')),
  hold_until      TIMESTAMPTZ,
  seq             BIGSERIAL     NOT NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  cancelled_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_secondary_sim_orders_book
  ON public.secondary_sim_orders (project_id, status, side, price_aud, seq);
CREATE INDEX IF NOT EXISTS idx_secondary_sim_orders_user
  ON public.secondary_sim_orders (user_id);

ALTER TABLE public.secondary_sim_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS secondary_sim_orders_owner_select ON public.secondary_sim_orders;
CREATE POLICY secondary_sim_orders_owner_select ON public.secondary_sim_orders
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = secondary_sim_orders.project_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS secondary_sim_orders_service_all ON public.secondary_sim_orders;
CREATE POLICY secondary_sim_orders_service_all ON public.secondary_sim_orders
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── trades ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.secondary_sim_trades (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     UUID          NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  buy_order_id   UUID          REFERENCES public.secondary_sim_orders(id) ON DELETE SET NULL,
  sell_order_id  UUID          REFERENCES public.secondary_sim_orders(id) ON DELETE SET NULL,
  buyer_key      TEXT          NOT NULL,
  buyer_label    TEXT          NOT NULL,
  seller_key     TEXT          NOT NULL,
  seller_label   TEXT          NOT NULL,
  price_aud      NUMERIC(14,4) NOT NULL CHECK (price_aud > 0),
  qty            BIGINT        NOT NULL CHECK (qty > 0),
  traded_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_secondary_sim_trades_project_time
  ON public.secondary_sim_trades (project_id, traded_at DESC);

ALTER TABLE public.secondary_sim_trades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS secondary_sim_trades_owner_select ON public.secondary_sim_trades;
CREATE POLICY secondary_sim_trades_owner_select ON public.secondary_sim_trades
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = secondary_sim_trades.project_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS secondary_sim_trades_service_all ON public.secondary_sim_trades;
CREATE POLICY secondary_sim_trades_service_all ON public.secondary_sim_trades
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.secondary_sim_orders IS
  'S27-B SANDBOX limit orders over a project''s tokenised shares — a simulation; no securities are offered or transferred (not an offer under Ch 6D / Ch 7 Corporations Act). Matched by lib/secondary/order-book.ts.';
COMMENT ON TABLE public.secondary_sim_trades IS
  'S27-B SANDBOX fills (price-time priority, resting price). Order refs SET NULL so the tape survives an erased placer.';
COMMENT ON TABLE public.secondary_sim_settings IS
  'S27-B per-project sandbox settings: shareholders'' agreement ROFR enforced as a hold on new sells (hours).';
COMMENT ON COLUMN public.secondary_sim_orders.holder_key IS
  'sh:<shareholders.id> (register holder the order trades as) or sb:<label> (invited sandbox buyer with no register row).';

NOTIFY pgrst, 'reload schema';
