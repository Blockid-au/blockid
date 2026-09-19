-- 0412 — ACS Digital Pulse moved (link-check 2026-09-19: old path 404).
-- Cite-only source; only the citation URL changes.
update public.external_sources
   set url = 'https://www.acs.org.au/campaign/digital-pulse.html'
 where id = 'acs-digital-pulse'
   and url = 'https://www.acs.org.au/insightsandpublications/reports-publications/digital-pulse.html';
