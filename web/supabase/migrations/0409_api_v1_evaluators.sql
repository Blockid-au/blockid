-- 0409_api_v1_evaluators.sql
-- ---------------------------------------------------------------------------
-- G14-S38 — Evaluator API v1 + Slack / Affinity / Airtable outbound
-- destinations (approved plan §5 row S38; goal doc F-7: `api.access` stays
-- Fund + Program only — plans.csv is NOT widened here).
--
--   1. api_keys.scopes text[]  — per-key scopes (lib/api-scopes.ts):
--        analyze            POST /api/v1/analyze (every key, today's behaviour)
--        evaluations:read   GET  /api/v1/evaluations, /[id]/dossier, /[id]/assessment
--        evaluations:write  POST|PUT /api/v1/evaluations/[id]/assessment
--      Existing keys keep working unchanged: the default '{analyze}' is what
--      they could already do. `permissions` (0024) stays as the legacy
--      column — never read by the v1 routes.
--   2. webhook_endpoints.kind  generic | slack | affinity | airtable — the
--      dispatcher (lib/webhooks/dispatch.ts sendOnce) picks the transformer
--      by kind; `generic` is today's HMAC-signed JSON, unchanged.
--   3. webhook_endpoints.destination_config_enc — the per-kind config
--      (Affinity API key + organisation / list id, Airtable token + base +
--      table, Slack {api_version}) sealed EXACTLY like secret_enc
--      (AES-256-GCM under WEBHOOK_SECRET_KEY, lib/webhooks/sign.ts). Never
--      returned by any route; the dispatcher opens it at send time.
--
-- Idempotent (IF NOT EXISTS columns / indexes, DO-guarded CHECK). Apply by
-- hand (never on deploy):
--   scripts/db/apply-migration.sh web/supabase/migrations/0409_api_v1_evaluators.sql
-- ---------------------------------------------------------------------------

-- ─── 1. api_keys.scopes ─────────────────────────────────────────────────────
alter table public.api_keys
  add column if not exists scopes text[] not null default '{analyze}';

comment on column public.api_keys.scopes is
  'G14-S38 (0409): per-key scopes — analyze | evaluations:read | evaluations:write (lib/api-scopes.ts). Default {analyze} = pre-S38 behaviour.';

create index if not exists api_keys_scopes_gin_idx
  on public.api_keys using gin (scopes);

-- ─── 2. webhook_endpoints.kind + destination_config_enc ─────────────────────
alter table public.webhook_endpoints
  add column if not exists kind text not null default 'generic';

alter table public.webhook_endpoints
  add column if not exists destination_config_enc text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'webhook_endpoints_kind_check'
       and conrelid = 'public.webhook_endpoints'::regclass
  ) then
    alter table public.webhook_endpoints
      add constraint webhook_endpoints_kind_check
      check (kind in ('generic', 'slack', 'affinity', 'airtable'));
  end if;
end $$;

comment on column public.webhook_endpoints.kind is
  'G14-S38 (0409): generic (signed JSON) | slack (Block Kit to hooks.slack.com) | affinity (POST /notes) | airtable (POST /v0/{base}/{table}). lib/webhooks/destinations/*.';
comment on column public.webhook_endpoints.destination_config_enc is
  'G14-S38 (0409): per-kind destination config sealed like secret_enc (lib/webhooks/destinations/index.ts sealDestinationConfig). Never leaves the server.';

-- Dispatcher / admin stats: how many outbound destinations per kind are live.
create index if not exists webhook_endpoints_kind_active_idx
  on public.webhook_endpoints (kind, active);

notify pgrst, 'reload schema';
