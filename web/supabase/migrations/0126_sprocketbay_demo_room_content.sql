-- 0126_sprocketbay_demo_room_content.sql
--
-- The Sprocketbay walkthrough room (seeded by 0300) marked 34 documents
-- 'complete' with no file_url and no template_content. Migration 0125 flipped
-- those flags to 'missing' so the demo stopped lying — but a demo room that is
-- entirely empty is not much of a demo either.
--
-- The seeder already carries a real one-sentence narrative per document in
-- `notes`. This turns each of those into an actual readable sample document in
-- `template_content`, and only then restores 'complete' — so every row an
-- investor clicks in the demo has something behind it, clearly labelled as
-- sample data. Rows with nothing to say stay 'missing'.
--
-- Idempotent: re-runnable, and safe to re-run after 0300 is re-applied.

begin;

with demo as (
  select d.id, d.document_name, d.folder, d.notes
    from public.data_room_documents d
    join public.data_rooms r on r.id = d.data_room_id
   where r.name = 'Sprocketbay Demo Data Room (Sample Data)'
     and d.notes like 'SAMPLE DATA%'
)
update public.data_room_documents t
   set template_content =
         '# ' || demo.document_name || ' — sample' || E'\n\n' ||
         '**Sprocketbay Demo Co · ' || demo.folder || '**' || E'\n\n' ||
         'This is illustrative content from the BlockID walkthrough, not a real ' ||
         'company document. It shows the shape and level of detail an investor ' ||
         'should expect behind this item in a live data room.' || E'\n\n' ||
         '## What the founder did' || E'\n\n' ||
         regexp_replace(demo.notes, '^SAMPLE DATA — S[0-9]+\. ', '') || E'\n\n' ||
         '## What an investor should check' || E'\n\n' ||
         '- Is this the current version, and when was it last updated?' || E'\n' ||
         '- Who prepared or executed it, and is that party independent where it needs to be?' || E'\n' ||
         '- Does it agree with the cap table, the metrics and the SVI evidence elsewhere in this room?',
       updated_at = now()
  from demo
 where t.id = demo.id;

-- Only now, with content actually written, may these rows claim to be complete.
update public.data_room_documents t
   set status = 'complete',
       completed_at = coalesce(t.completed_at, now()),
       updated_at = now()
  from public.data_rooms r
 where r.id = t.data_room_id
   and r.name = 'Sprocketbay Demo Data Room (Sample Data)'
   and t.status = 'missing'
   and t.template_content is not null
   and btrim(t.template_content) <> '';

update public.data_rooms
   set completeness_score = (
         select round(100.0 * count(*) filter (where status = 'complete') / greatest(count(*), 1))
           from public.data_room_documents d
          where d.data_room_id = data_rooms.id
       ),
       startup_name = coalesce(startup_name, 'Sprocketbay Demo Co (Sample Profile)'),
       stage = greatest(stage, 6)
 where name = 'Sprocketbay Demo Data Room (Sample Data)';

commit;

notify pgrst, 'reload schema';
