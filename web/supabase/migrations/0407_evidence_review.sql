-- 0407_evidence_review.sql
-- ---------------------------------------------------------------------------
-- G14-S36 — Verification integrity (docs/plans/g14-investor-feedback-
-- 2026-09-16.md §3 decisions D4 + F-6; approved plan §5 row S36).
--
-- Before S36 the party making a claim was also grading it: the upload route
-- honoured any founder-posted `confidence_level` (including
-- third_party_verified) and the extractor promoted an analysis on keywords.
-- lib/evidence/confidence-cap.ts now caps every founder-origin write at
-- document_uploaded; third_party_verified is reachable ONLY through a human
-- reviewer approval (PATCH /api/admin/evidence/[id]/review), which sets
-- is_verified / verified_at / verified_by_user_id.
--
--   1. svi_dimension_evidence.review_status  none | pending | approved | rejected
--      — the founder presses "Request verification" (→ pending), the admin
--      queue /admin/evidence-review approves or rejects. review_note is the
--      reviewer's reason (shown to the founder).
--   2. Backfill: legacy third_party_verified rows that no reviewer signed
--      (is_verified = false) are downgraded to document_uploaded and queued
--      as pending — the founder keeps the row, the score keeps the honest
--      level, the reviewer sees it next.
--   3. CHECK tpv_requires_review: third_party_verified ⇒ is_verified. Added
--      NOT VALID (no table-wide lock on a live table) and validated right
--      after the backfill, so the invariant holds for every row from here.
--   4. Index on projects(verification_level) — the F-6 multiplier and the
--      "Verified ABN" badges now read it per project / per listing.
--
-- Dry-run (what the backfill will touch — run BEFORE applying):
--   select count(*) from public.svi_dimension_evidence
--    where confidence_level = 'third_party_verified' and not coalesce(is_verified, false);
--   -- 2026-09-16 production: 0 rows (svi_dimension_evidence is empty).
--   select count(*) from public.svi_evidence
--    where confidence_level = 'third_party_verified' and verified_at is null;
--   -- 2026-09-16 production: 3 rows (legacy account-level vault; the code
--   -- path caps them at read time — lib/svi/rescore-from-evidence.ts
--   -- effectiveConfidenceLevel — so this migration leaves that table alone).
--
-- Idempotent (DO-guarded ADD CONSTRAINT, IF NOT EXISTS columns / index; the
-- backfill is a no-op on a second run because the CHECK already holds).
-- Apply by hand (never on deploy):
--   scripts/db/apply-migration.sh web/supabase/migrations/0407_evidence_review.sql
--
-- Rollback
--   alter table public.svi_dimension_evidence drop constraint if exists svi_dimension_evidence_tpv_requires_review;
--   alter table public.svi_dimension_evidence drop column if exists review_status, drop column if exists review_note;
--   drop index if exists projects_verification_level_idx;
--   (the backfilled rows stay document_uploaded / pending — re-approve via the queue)
-- ---------------------------------------------------------------------------

begin;

-- ─── 1. review columns ──────────────────────────────────────────────────────
alter table public.svi_dimension_evidence
  add column if not exists review_status text not null default 'none',
  add column if not exists review_note text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'svi_dimension_evidence_review_status_check'
       and conrelid = 'public.svi_dimension_evidence'::regclass
  ) then
    alter table public.svi_dimension_evidence
      add constraint svi_dimension_evidence_review_status_check
      check (review_status in ('none', 'pending', 'approved', 'rejected'));
  end if;
end $$;

comment on column public.svi_dimension_evidence.review_status is
  'G14-S36: none | pending (founder requested verification) | approved (reviewer set is_verified) | rejected (see review_note).';
comment on column public.svi_dimension_evidence.review_note is
  'G14-S36: reviewer note shown to the founder on approve / reject.';

create index if not exists svi_dimension_evidence_review_pending_idx
  on public.svi_dimension_evidence (created_at)
  where review_status = 'pending';

-- ─── 2. backfill: unreviewed third_party_verified → document_uploaded, pending ─
update public.svi_dimension_evidence
   set confidence_level = 'document_uploaded',
       review_status    = 'pending',
       review_note      = coalesce(review_note, 'Downgraded at S36: third-party verification requires a reviewer approval.'),
       updated_at       = now()
 where confidence_level = 'third_party_verified'
   and not coalesce(is_verified, false);

-- rows a reviewer DID sign keep their level and are marked approved
update public.svi_dimension_evidence
   set review_status = 'approved'
 where confidence_level = 'third_party_verified'
   and coalesce(is_verified, false)
   and review_status = 'none';

-- ─── 3. invariant: third_party_verified ⇒ is_verified ───────────────────────
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'svi_dimension_evidence_tpv_requires_review'
       and conrelid = 'public.svi_dimension_evidence'::regclass
  ) then
    alter table public.svi_dimension_evidence
      add constraint svi_dimension_evidence_tpv_requires_review
      check (confidence_level <> 'third_party_verified' or coalesce(is_verified, false)) not valid;
  end if;
end $$;

alter table public.svi_dimension_evidence
  validate constraint svi_dimension_evidence_tpv_requires_review;

-- ─── 4. projects(verification_level) for the multiplier + badges ────────────
create index if not exists projects_verification_level_idx
  on public.projects (verification_level);

commit;

notify pgrst, 'reload schema';
