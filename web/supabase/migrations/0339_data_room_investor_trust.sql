-- 0339_data_room_investor_trust.sql
-- ---------------------------------------------------------------------------
-- S21-A — investor data room trust layer: NDA click-wrap, engagement
-- heatmap, per-investor PDF watermark.
--
-- Why
--   Roadmap-v2 reconciliation 2026-09-11 items 6/7/8. The columns for all
--   three features existed (0062 `nda_required` / `nda_signed_at` /
--   `nda_signed_ip` on the link, 0062 `data_room_engagement`, 0251
--   `share_packages.watermark`) but no behaviour sat behind them: nothing
--   asked an investor to accept anything, no client posted an engagement
--   event, and no renderer applied a watermark. This migration adds the
--   room-level settings the founder edits, the acceptance ledger, and the
--   per-link watermark mirror of `share_packages.watermark`.
--
-- What
--   1. `data_rooms` — founder-editable trust settings:
--        nda_required      the room asks for an NDA before listing documents
--        nda_text          the clause shown (null → app default)
--        nda_version       bumped by the founder; a link accepted on an older
--                          version is re-prompted
--        watermark_enabled burn "Prepared for <investor> · <date> · BlockID.au"
--                          diagonally on every page of a PDF served through a
--                          share link
--   2. `data_room_access_tokens.nda_signed_version` — which version the link
--      accepted; `nda_signed_at` (0062) stays the timestamp.
--      `data_room_access_tokens.watermark` — recipient identifier for the
--      watermark line; same semantics as `share_packages.watermark` (0251).
--   3. `data_room_nda_acceptances` — append-only ledger, one row per
--      (link, version) acceptance: viewer email if collected, salted ip hash,
--      user-agent family, timestamp. Never the raw IP or full UA.
--   4. Index on `data_room_engagement (access_token_id, event_type, section,
--      occurred_at desc)` for the 30 s dedupe read and the heatmap query.
--
-- Plan gating lives in code (`investor_links.premium`, founder_starter+,
-- migration 0131) — no plan row changes here.
--
-- Apply as the table owner (data_rooms is owned by supabase_admin, see 0123):
--   docker exec -i supabase-db psql -U supabase_admin -d postgres \
--     < web/supabase/migrations/0339_data_room_investor_trust.sql
--
-- Idempotent: IF NOT EXISTS everywhere; safe to re-run.
-- ---------------------------------------------------------------------------

begin;

-- 1. Room-level trust settings ------------------------------------------------
alter table public.data_rooms
  add column if not exists nda_required boolean not null default false,
  add column if not exists nda_text text,
  add column if not exists nda_version integer not null default 1
    check (nda_version >= 1),
  add column if not exists watermark_enabled boolean not null default false;

comment on column public.data_rooms.nda_required is
  'When true, /s/dr/[token] shows the NDA clause and an "I agree" step before any document is listed; document/PDF reads refuse server-side until the link has accepted the current nda_version.';
comment on column public.data_rooms.nda_text is
  'Founder-edited NDA clause (plain text). NULL → the app default mutual-confidentiality clause in lib/dataroom/nda.ts.';
comment on column public.data_rooms.nda_version is
  'Bumped by the founder when the clause changes; every link accepted on an older version is asked again.';
comment on column public.data_rooms.watermark_enabled is
  'When true (and the owner plan carries investor_links.premium), PDFs served through a share link carry a diagonal "Prepared for <recipient> · <date> · BlockID.au" watermark on every page.';

-- 2. Per-link acceptance pointer + watermark mirror ---------------------------
alter table public.data_room_access_tokens
  add column if not exists nda_signed_version integer,
  add column if not exists watermark text;

comment on column public.data_room_access_tokens.nda_signed_version is
  'data_rooms.nda_version the link accepted (nda_signed_at is when). NULL or < current version → the gate shows again.';
comment on column public.data_room_access_tokens.watermark is
  'Recipient identifier burned into PDFs served through this link — same semantics as share_packages.watermark (0251). Defaults to investor name / email at mint time.';

-- 3. Acceptance ledger --------------------------------------------------------
create table if not exists public.data_room_nda_acceptances (
  id               uuid        primary key default gen_random_uuid(),
  data_room_id     uuid        not null references public.data_rooms(id) on delete cascade,
  access_token_id  uuid        not null references public.data_room_access_tokens(id) on delete cascade,
  account_id       uuid        not null,          -- room owner (tenancy key for RLS)
  nda_version      integer     not null check (nda_version >= 1),
  nda_text_sha256  text,                          -- hash of the clause shown, so a later edit cannot rewrite what was accepted
  viewer_email     text,                          -- only when the investor typed one
  ip_hash          text,                          -- salted sha256 prefix, never the raw address
  ua_family        text,                          -- chrome / safari / firefox / … (lib/audit/redact uaFamily)
  accepted_at      timestamptz not null default now()
);

-- One acceptance per (link, version): a double-click or a replayed beacon is a
-- no-op rather than a second row.
create unique index if not exists data_room_nda_acceptances_link_version_uidx
  on public.data_room_nda_acceptances (access_token_id, nda_version);
create index if not exists data_room_nda_acceptances_room_idx
  on public.data_room_nda_acceptances (data_room_id, accepted_at desc);

alter table public.data_room_nda_acceptances enable row level security;

drop policy if exists drna_service on public.data_room_nda_acceptances;
create policy drna_service on public.data_room_nda_acceptances
  for all to service_role using (true) with check (true);

-- Founder reads their own room's ledger; nobody edits it from a client —
-- writes go through the service role in /api/data-room/nda only.
drop policy if exists drna_owner_select on public.data_room_nda_acceptances;
create policy drna_owner_select on public.data_room_nda_acceptances
  for select to authenticated using (account_id = auth.uid());

comment on table public.data_room_nda_acceptances is
  'S21-A NDA click-wrap ledger: one row per (share link, nda_version) acceptance recorded by POST /api/data-room/nda. Append-only; the salted ip hash + UA family are the only viewer fingerprint kept (Privacy Act 1988 APP 3 — minimum necessary).';

-- 4. Engagement dedupe / heatmap index ---------------------------------------
create index if not exists idx_dre_token_section_time
  on public.data_room_engagement (access_token_id, event_type, section, occurred_at desc);

commit;

notify pgrst, 'reload schema';
