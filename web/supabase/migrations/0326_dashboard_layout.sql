-- 0326_dashboard_layout.sql
-- ---------------------------------------------------------------------------
-- G4 #4 — Dashboard personalization, server-synced (2026-09-11).
--
-- /dashboard already lets a founder pin + reorder its widgets, but the
-- layout lived in localStorage only, so it never followed the founder to a
-- second browser or device. This adds one jsonb column on app_users that
-- holds the whole layout blob; localStorage stays the instant cache and the
-- offline / signed-out fallback (see components/dashboard/widget-grid.tsx).
--
-- Shape (validated by lib/dashboard/widget-layout.ts parseLayout):
--   {
--     "v": 1,
--     "order":  ["metrics", "svi-radar", ...],   -- non-pinned tail order
--     "pinned": ["health-score"],                -- render first, pin order
--     "hidden": ["cohort-benchmark"],            -- optional, not rendered
--     "updated_at": "2026-09-11T02:15:00.000Z"   -- last-writer stamp; the
--   }                                            -- client compares it with
--                                                -- its local stamp and the
--                                                -- newer side wins
--
-- Widget ids are validated against the allow-list in
-- lib/dashboard/widget-ids.ts on write; unknown ids are dropped, and the
-- payload is capped at 4 KB by the route. No new table, no new policy:
-- app_users has RLS enabled with no self-service policies (custom magic-link
-- auth — every read/write goes through the service role in
-- GET/PUT /api/dashboard/layout, which scopes to the signed-in user's row).
--
-- Rollback
--   alter table public.app_users drop constraint if exists app_users_dashboard_layout_shape_chk;
--   alter table public.app_users drop column if exists dashboard_layout;
--
-- Apply by hand (self-hosted Supabase; migrations are not run on deploy):
--   docker cp web/supabase/migrations/0326_dashboard_layout.sql supabase-db:/tmp/0326.sql
--   docker exec supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/0326.sql
--   docker exec supabase-db psql -U postgres -d postgres -c "NOTIFY pgrst, 'reload schema'"
-- ---------------------------------------------------------------------------

begin;

alter table public.app_users
  add column if not exists dashboard_layout jsonb;

comment on column public.app_users.dashboard_layout is
  'Founder /dashboard widget layout {v:1, order[], pinned[], hidden?[], updated_at}. Written only via PUT /api/dashboard/layout (service role, allow-listed ids, <= 4 KB). NULL = never customised; localStorage on the client is the cache/fallback.';

-- Belt and braces: the route validates the blob, but keep the DB honest
-- about the top-level shape so a stray write can never break the reader.
alter table public.app_users
  drop constraint if exists app_users_dashboard_layout_shape_chk;
alter table public.app_users
  add constraint app_users_dashboard_layout_shape_chk check (
    dashboard_layout is null
    or (
      jsonb_typeof(dashboard_layout) = 'object'
      and (dashboard_layout ->> 'v') = '1'
      and jsonb_typeof(dashboard_layout -> 'order') = 'array'
      and jsonb_typeof(dashboard_layout -> 'pinned') = 'array'
      and (dashboard_layout -> 'hidden' is null or jsonb_typeof(dashboard_layout -> 'hidden') = 'array')
      and jsonb_typeof(dashboard_layout -> 'updated_at') = 'string'
      and pg_column_size(dashboard_layout) <= 8192
    )
  );

commit;

notify pgrst, 'reload schema';
