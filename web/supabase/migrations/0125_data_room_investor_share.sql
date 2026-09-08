-- 0125_data_room_investor_share.sql
--
-- Makes the investor data room actually shareable, and stops the seeded demo
-- room from lying about what is inside it.
--
-- Context: POST /api/investor-data-room inserted `account_id, email, token,
-- title, is_active, view_count, expires_at` into `data_rooms`. None of those
-- columns exist, so "Share with investor" has been a guaranteed 500 since it
-- shipped. The real share record is `data_room_access_tokens`, which already
-- carries token / expires_at / is_active / access_count / investor identity.
-- This migration adds the three things that table and its view log were
-- missing, and repairs two dishonest data states.

begin;

-- 1. Revocation audit trail. `is_active` says whether the link works; it does
--    not say when the founder pulled it. Investors ask.
alter table public.data_room_access_tokens
  add column if not exists revoked_at timestamptz;

comment on column public.data_room_access_tokens.revoked_at is
  'When the founder revoked this share link. Non-null implies is_active=false.';

-- 2. Attribute each view to the share link that was opened, so a founder can
--    see WHICH investor looked, not just that somebody did. `investor_link_views`
--    was not usable here: it FKs to investor_links(token) and scores(id), a
--    different domain (the /s/i score-share surface) with no data_room_id.
alter table public.data_room_views
  add column if not exists access_token_id uuid
    references public.data_room_access_tokens(id) on delete set null;
alter table public.data_room_views
  add column if not exists referer text;

comment on column public.data_room_views.access_token_id is
  'Share link that was opened. Joins to data_room_access_tokens for investor identity.';

create index if not exists idx_data_room_views_token
  on public.data_room_views (access_token_id, created_at desc);

-- 3. Provenance on documents. Regenerating a room must replace the rows the
--    platform generated without touching anything the founder uploaded.
alter table public.data_room_documents
  add column if not exists origin text not null default 'manual';

alter table public.data_room_documents
  drop constraint if exists data_room_documents_origin_check;
alter table public.data_room_documents
  add constraint data_room_documents_origin_check
    check (origin in ('manual', 'generated'));

comment on column public.data_room_documents.origin is
  'manual = founder-created/uploaded. generated = written by /api/data-room/generate and safe to replace on regenerate.';

-- 4. Consent by default. `data_rooms.is_public` was true on a room nobody
--    consented to share (the BlockID.au Showcase row, whose `sections` blob is
--    an unrelated 242-entry knowledge-base index). A room is reachable ONLY
--    through a share link the founder explicitly minted, so no read path
--    consults is_public any more — clear the flag so it cannot be revived
--    into an implicit publish.
update public.data_rooms set is_public = false where is_public is true;

-- 5. Honest status. The seeded demo room marks 34 documents 'complete' with
--    zero file_url and zero template_content: a full checklist with nothing
--    behind it, which reads worse to an investor than an honest gap list.
update public.data_room_documents
   set status = 'missing',
       completed_at = null,
       updated_at = now()
 where status = 'complete'
   and file_url is null
   and drive_file_id is null
   and (template_content is null or btrim(template_content) = '');

commit;

notify pgrst, 'reload schema';
