-- 0479_g36_funding_url_fixes.sql — G36 tick 5 (26/11/2026). DATA ONLY, no schema change.
--
-- The weekly link check (content/reports/link-check-latest.json) has listed six
-- broken official links on /funding pages since 29/09–03/10 (escalated 21/10),
-- and https://www.capitalangels.com.au/ now redirects through unrelated sites
-- (cafe menu → wedding venue): the domain no longer belongs to the angel group.
-- The seed files (content/data/programs-au*.json, grants-au.seed.json) already
-- carry the corrected URLs; the live au_grants / au_programs rows were seeded
-- before those corrections, so the pages still show the old links.
--
-- Every replacement was fetched 26/11/2026 (HTTP 200, page title checked).
-- Each UPDATE is guarded on the old URL → idempotent, and a no-op for any row an
-- admin has already corrected.
--
-- Apply: docker exec -i <supabase-db> psql -U postgres -d postgres < this file
-- (then nothing else: the funding pages read the tables directly; ISR picks the
-- change up on the next revalidate).

BEGIN;

-- Programme closed; business.gov.au removed the Round 3 page (404). Same archive
-- snapshot the seed has used since 10/09.
UPDATE public.au_grants
   SET official_url = 'https://web.archive.org/web/20240616203825/https://business.gov.au/grants-and-programs/boosting-female-founders-initiative-round-3',
       updated_at = now()
 WHERE id = 'boosting-female-founders'
   AND official_url = 'https://business.gov.au/grants-and-programs/boosting-female-founders-initiative-round-3';

UPDATE public.au_programs
   SET official_url = 'https://enterprize.space/programs/', updated_at = now()
 WHERE official_url IN ('https://enterprize.space/programs/enterprize-elevate',
                        'https://enterprize.space/programs/enterprize-elevate/');

UPDATE public.au_programs
   SET official_url = 'https://enterprize.space/join/', updated_at = now()
 WHERE official_url IN ('https://enterprize.space/workspaces', 'https://enterprize.space/workspaces/');

UPDATE public.au_programs
   SET official_url = 'https://somethingfest.com.au/', updated_at = now()
 WHERE official_url IN ('https://somethingfest.com.au/festival', 'https://somethingfest.com.au/festival/');

-- Swinburne renamed the Accelerator Program to "Elevate" and moved it.
UPDATE public.au_programs
   SET official_url = 'https://www.swinburne.edu.au/research/platforms-initiatives/innovation-studio/elevate-program/',
       updated_at = now()
 WHERE official_url IN ('https://www.swinburne.edu.au/innovation-precinct/get-involved/accelerator-program',
                        'https://www.swinburne.edu.au/innovation-precinct/get-involved/accelerator-program/');

-- Hijacked domain: never send founders there. Archived site + low confidence
-- (shown as "needs review") until someone confirms the group is still active.
UPDATE public.au_programs
   SET official_url = 'https://web.archive.org/web/20231211192301/https://www.capitalangels.com.au/',
       status_confidence = 'low',
       updated_at = now()
 WHERE official_url IN ('https://www.capitalangels.com.au/', 'https://www.capitalangels.com.au',
                        'https://capitalangels.com.au/', 'https://capitalangels.com.au');

-- Expect: 1 grant + 5 programme rows changed on the first run, 0 afterwards.
SELECT 'au_grants' AS t, count(*) FROM public.au_grants
 WHERE official_url LIKE '%boosting-female-founders-initiative-round-3' AND official_url NOT LIKE 'https://web.archive.org/%'
UNION ALL
SELECT 'au_programs still broken', count(*) FROM public.au_programs
 WHERE official_url ~ '(capitalangels\.com\.au/?$|enterprize-elevate|enterprize\.space/workspaces|somethingfest\.com\.au/festival|innovation-precinct/get-involved/accelerator-program)'
   AND official_url NOT LIKE 'https://web.archive.org/%';

COMMIT;
