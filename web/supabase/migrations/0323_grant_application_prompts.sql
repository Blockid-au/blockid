-- 0323_grant_application_prompts.sql
-- ---------------------------------------------------------------------------
-- T0251 (G11 sprint S5) — Growth extras of the Money Radar ladder
-- (docs/plans/money-finder-2026-09-10.md §4h Growth A$69 row):
--
--   1. au_grants.application_prompts  — per-grant application questions from
--                                       the official guidelines (jsonb array
--                                       of {id, question, guidance?, max_words?}).
--                                       Seeded below for 21 grants; the seed
--                                       file web/content/data/grants-au.seed.json
--                                       is the source of truth (scripts/
--                                       seed-au-funding.mjs re-applies it).
--   2. grant_application_drafts       — one row per generated draft (answers
--                                       jsonb keyed by prompt id). Growth /
--                                       Startup Package: credits_cost 0;
--                                       Starter: FEATURE_COSTS.grant_application_draft.
--   3. app_users.investor_prefs       — the jsonb column investor-portal.ts has
--                                       read/written since W5 but no migration
--                                       ever created (it degrades to defaults
--                                       when missing); created here so the
--                                       reverse-match has something to read.
--      app_users.investor_discoverable — opt-in flag: only discoverable
--                                       investor accounts are surfaced to
--                                       founders ("Investors who match").
--   4. analysis_refreshes             — quarterly "what changed for your
--                                       startup" note per (user, project,
--                                       quarter) written by
--                                       /api/cron/analysis-refresh-quarterly.
--
-- Idempotent. Apply by hand (self-hosted Supabase; migrations are not run on
-- deploy):
--   docker cp web/supabase/migrations/0323_grant_application_prompts.sql supabase-db:/tmp/0323.sql
--   docker exec supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/0323.sql
--
-- Rollback
--   drop table if exists public.analysis_refreshes;
--   drop table if exists public.grant_application_drafts;
--   alter table public.au_grants drop column if exists application_prompts;
--   alter table public.app_users drop column if exists investor_discoverable;
--   (keep app_users.investor_prefs — the investor portal writes to it)
-- ---------------------------------------------------------------------------

begin;

-- ─── 1. au_grants.application_prompts ────────────────────────────────────────
alter table public.au_grants
  add column if not exists application_prompts jsonb not null default '[]'::jsonb;

comment on column public.au_grants.application_prompts is
  'Application questions from the official guidelines: [{id, question, guidance?, max_words?}]. Empty = drafter uses the generic 4-question set (lib/funding/application-prompts.ts).';

-- ─── 2. grant_application_drafts ─────────────────────────────────────────────
create table if not exists public.grant_application_drafts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.app_users(id) on delete cascade,
  project_id    uuid references public.projects(id) on delete cascade,
  grant_id      text not null references public.au_grants(id) on delete cascade,
  -- {"<prompt_id>": "<answer>"} — empty strings when the AI call failed (never blank rows).
  answers       jsonb not null default '{}'::jsonb,
  -- Snapshot of the prompts the answers were drafted against (grant prompts change over time).
  prompts       jsonb not null default '[]'::jsonb,
  credits_cost  integer not null default 0,
  status        text not null default 'draft' check (status in ('draft','final')),
  -- {ai_ok: bool, provider?, model?, context?: [...]} — what the drafter saw.
  meta          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists grant_application_drafts_user_idx
  on public.grant_application_drafts (user_id, updated_at desc);
create index if not exists grant_application_drafts_lookup_idx
  on public.grant_application_drafts (user_id, project_id, grant_id, updated_at desc);

comment on table public.grant_application_drafts is
  'T0251: AI-drafted answers to a grant''s application_prompts for one startup. Growth / Startup Package = unlimited (credits_cost 0); Starter pays FEATURE_COSTS.grant_application_draft after confirming.';

alter table public.grant_application_drafts enable row level security;

drop policy if exists grant_application_drafts_owner_all on public.grant_application_drafts;
create policy grant_application_drafts_owner_all on public.grant_application_drafts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists grant_application_drafts_service_all on public.grant_application_drafts;
create policy grant_application_drafts_service_all on public.grant_application_drafts
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists grant_application_drafts_set_updated_at on public.grant_application_drafts;
create trigger grant_application_drafts_set_updated_at
  before update on public.grant_application_drafts
  for each row execute function public.set_updated_at();

-- ─── 3. app_users.investor_prefs + investor_discoverable ─────────────────────
alter table public.app_users
  add column if not exists investor_prefs jsonb;
alter table public.app_users
  add column if not exists investor_discoverable boolean not null default false;

create index if not exists app_users_investor_discoverable_idx
  on public.app_users (id)
  where investor_discoverable;

comment on column public.app_users.investor_prefs is
  'Investor deal-flow preferences {sectors[], stages[], geos[], cheque_band, min_svi, updated_at} — lib/investor-portal.ts.';
comment on column public.app_users.investor_discoverable is
  'Investor opt-in: when true the account (display name + prefs, never email) can be listed to Growth founders under "Investors who match" (T0251). Default off.';

-- ─── 4. analysis_refreshes ───────────────────────────────────────────────────
create table if not exists public.analysis_refreshes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.app_users(id) on delete cascade,
  project_id  uuid references public.projects(id) on delete cascade,
  -- "2026-Q3" — the quarter the note covers (the one that just ended).
  quarter     text not null,
  body_md     text not null,
  changes     integer not null default 0,
  -- {svi: {prev, now, delta}, matches: {new, closed, paused}, knowledge: n}
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

alter table public.analysis_refreshes
  add column if not exists project_key uuid
    generated always as (coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid)) stored;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'analysis_refreshes_quarter_key'
       and conrelid = 'public.analysis_refreshes'::regclass
  ) then
    alter table public.analysis_refreshes
      add constraint analysis_refreshes_quarter_key unique (user_id, project_key, quarter);
  end if;
end;
$$;

create index if not exists analysis_refreshes_user_idx
  on public.analysis_refreshes (user_id, created_at desc);

comment on table public.analysis_refreshes is
  'T0251: quarterly "what changed for your startup" note (SVI delta, grant catalogue changes on the founder''s matches, CFO/CLO knowledge) for Growth founders; one per (user, project, quarter).';

alter table public.analysis_refreshes enable row level security;

drop policy if exists analysis_refreshes_owner_select on public.analysis_refreshes;
create policy analysis_refreshes_owner_select on public.analysis_refreshes
  for select using (user_id = auth.uid());

drop policy if exists analysis_refreshes_service_all on public.analysis_refreshes;
create policy analysis_refreshes_service_all on public.analysis_refreshes
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- ─── 5. Seed application_prompts (generated from grants-au.seed.json) ────────
-- BEGIN application_prompts seed (keep in sync — application-prompts.test.ts checks parity)
update public.au_grants set application_prompts = '[{"id":"core_activity","question":"Describe each core R&D activity: the hypothesis, the experiment you ran or will run, how you observed and evaluated results, and the conclusion you drew.","guidance":"The ATO/AusIndustry test is a systematic progression of work based on established science — state the technical uncertainty a competent professional could not resolve upfront.","max_words":400},{"id":"new_knowledge","question":"What new knowledge (new or improved materials, products, devices, processes or services) did the activity aim to generate?","guidance":"Knowledge new to the world, not just new to your company.","max_words":200},{"id":"supporting_activities","question":"List the supporting R&D activities and explain how each was directly related to a core activity.","guidance":"Software builds that only enable the experiment qualify; routine development and bug-fixing do not.","max_words":250},{"id":"expenditure","question":"Break down eligible R&D expenditure for the income year: salaries, contractors (AU-based), overheads and RSP fees.","guidance":"Contemporaneous records — timesheets, Git history, lab notebooks — must back every dollar.","max_words":200},{"id":"eligibility","question":"Confirm the company is incorporated in Australia, the aggregated turnover, and that the R&D was conducted for the company (not on behalf of another entity).","max_words":120}]'::jsonb where id = 'rdti';
update public.au_grants set application_prompts = '[{"id":"innovation","question":"Describe the product, process, service, marketing or organisational method you are developing and how it is new or significantly improved.","guidance":"ESIC 100-point innovation test or the principles-based test — pick one and evidence it.","max_words":300},{"id":"commercialisation","question":"How will the innovation be commercialised, and what is the high-growth potential beyond the local market?","max_words":250},{"id":"scale","question":"Explain how the business can scale (unit economics, distribution) without proportional increases in cost.","max_words":200},{"id":"competitive_advantage","question":"What competitive advantages does the company have over incumbents and other startups?","max_words":200},{"id":"early_stage_test","question":"Confirm incorporation date, prior-year expenses (< A$1M), assessable income (< A$200k) and that the company is not listed.","guidance":"The early-stage test is a hard gate — attach the last financial statements.","max_words":120}]'::jsonb where id = 'esic';
update public.au_grants set application_prompts = '[{"id":"project_summary","question":"Summarise the commercialisation project: the innovative product, process or service and the National Reconstruction Fund priority area it addresses.","guidance":"Priority areas: renewables & low-emissions, medical science, transport, value-add agriculture/forestry/fisheries, resources, defence, enabling capabilities.","max_words":300},{"id":"market","question":"Describe the target market, its size, and evidence customers will pay.","max_words":250},{"id":"novelty","question":"What makes the innovation novel compared with existing solutions in Australia and internationally?","max_words":250},{"id":"plan","question":"Outline the project plan: milestones, timeline, key risks and mitigations.","max_words":300},{"id":"budget","question":"Provide the project budget and your 50% co-contribution source.","guidance":"Matched funding must be cash you can evidence at contract.","max_words":200},{"id":"capability","question":"Describe the team, IP position and any partners.","max_words":200}]'::jsonb where id = 'igp-early-stage';
update public.au_grants set application_prompts = '[{"id":"project_summary","question":"Summarise the growth project and the National Reconstruction Fund priority area it serves.","max_words":300},{"id":"traction","question":"Provide traction evidence: revenue, customers, pilots, letters of intent.","max_words":250},{"id":"growth_plan","question":"Describe the growth plan — how grant funding accelerates scale-up and the commercial outcomes expected in 3 years.","max_words":350},{"id":"budget","question":"Provide the budget with your 50% cash co-contribution and its source.","max_words":200},{"id":"capability","question":"Describe the team, governance and manufacturing/delivery capability.","max_words":200}]'::jsonb where id = 'igp-commercialisation-growth';
update public.au_grants set application_prompts = '[{"id":"novel_product","question":"Describe the novel product, process or service and its technical readiness level.","max_words":300},{"id":"market_opportunity","question":"Describe the market opportunity, target customers and evidence of demand.","max_words":250},{"id":"commercialisation_activities","question":"Which commercialisation activities will the grant fund (e.g. trials, certification, first sales) and what milestones will you hit?","max_words":300},{"id":"management","question":"Describe the management team''s ability to execute and any advisers or partners.","max_words":200},{"id":"budget","question":"Provide the project budget and matched-funding source.","max_words":150}]'::jsonb where id = 'accelerating-commercialisation';
update public.au_grants set application_prompts = '[{"id":"export_strategy","question":"Describe your export market, entry strategy and why the market was chosen.","guidance":"EMDG rounds are competitive — tie the plan to a named market and measurable milestones.","max_words":300},{"id":"promotional_activities","question":"List the eligible promotional activities (trade shows, digital marketing, market visits, IP registration) and expected cost per activity.","max_words":250},{"id":"readiness","question":"Explain your export readiness: product suitability, capacity to supply, regulatory approvals.","max_words":200},{"id":"outcomes","question":"What export sales and partnerships do you expect within two years?","max_words":150},{"id":"eligibility","question":"Confirm ABN, Australian ownership of the goods/IP, and annual turnover under A$20M.","max_words":100}]'::jsonb where id = 'emdg';
update public.au_grants set application_prompts = '[{"id":"research_need","question":"Describe the research question or technical problem you need CSIRO expertise to solve.","guidance":"Kick-Start funds CSIRO research time — frame the ask as a scoped research activity, not product development.","max_words":250},{"id":"commercial_relevance","question":"How will the research outcome change your product or business model?","max_words":200},{"id":"company_profile","question":"Describe the company: incorporation date, turnover (< A$1.5M) and team.","guidance":"Must be < 3 years old or turnover < A$1.5M in the last financial year.","max_words":120},{"id":"co_contribution","question":"Confirm your dollar-matched contribution (A$10k–A$50k) and its source.","max_words":100},{"id":"outcomes","question":"What are the expected outcomes and next steps after the project?","max_words":150}]'::jsonb where id = 'csiro-kick-start';
update public.au_grants set application_prompts = '[{"id":"business_overview","question":"Describe the business, its stage and the majority female ownership structure.","max_words":250},{"id":"growth_opportunity","question":"What growth opportunity will the grant unlock and what barriers has your business faced in accessing capital?","max_words":250},{"id":"activities","question":"List the funded activities and how each contributes to scaling into domestic or global markets.","max_words":250},{"id":"outcomes","question":"Describe the measurable outcomes (revenue, jobs, customers) at 12 and 24 months.","max_words":200},{"id":"budget","question":"Provide the budget and the source of your matched contribution.","max_words":150}]'::jsonb where id = 'boosting-female-founders';
update public.au_grants set application_prompts = '[{"id":"export_contract","question":"Describe the export contract or purchase order the loan will fund (buyer, value, timing).","max_words":200},{"id":"business_overview","question":"Describe the business, its trading history and turnover.","max_words":200},{"id":"funding_gap","question":"Why can your bank not fund this order, and how will the loan close the gap?","max_words":200},{"id":"repayment","question":"Show the cash-flow plan for repaying the loan from export receipts.","max_words":200}]'::jsonb where id = 'efa-small-business-export-loan';
update public.au_grants set application_prompts = '[{"id":"business_plan","question":"Summarise the business idea, the customers and how you will reach them.","max_words":250},{"id":"owner_profile","question":"Describe the Indigenous ownership (at least 50%) and the owners'' relevant experience.","max_words":150},{"id":"funding_use","question":"What will the finance be used for, and what is your own contribution?","max_words":200},{"id":"viability","question":"Provide a 12-month cash-flow forecast and how the business will meet repayments.","max_words":250}]'::jsonb where id = 'iba-startup-finance';
update public.au_grants set application_prompts = '[{"id":"project_summary","question":"Summarise the renewable energy project, the technology and the stage of development.","guidance":"ARENA funds projects that de-risk renewable technology for the whole sector — say why the outcome is shareable.","max_words":300},{"id":"innovation","question":"Explain what is innovative about the project compared with the current state of the art in Australia.","max_words":250},{"id":"knowledge_sharing","question":"What knowledge will the project create and how will it be shared with the industry?","guidance":"Knowledge sharing is a formal ARENA obligation — name the reports, data sets and forums.","max_words":200},{"id":"commercial_pathway","question":"Describe the pathway to commercial deployment and the barriers the grant removes.","max_words":250},{"id":"budget","question":"Provide the total project cost, ARENA funding requested and the source of your co-funding.","max_words":200},{"id":"team","question":"Describe the project team, partners and delivery capability.","max_words":200}]'::jsonb where id = 'arena-advancing-renewables';
update public.au_grants set application_prompts = '[{"id":"product","question":"Describe the minimum viable product and its current technology readiness level (TRL 3–7).","guidance":"MVP Ventures funds the step from working prototype to a commercially ready product — name the TRL you start and finish at.","max_words":250},{"id":"commercialisation","question":"What commercialisation activities will the grant fund and what will be different at completion?","max_words":250},{"id":"market","question":"Describe the target customers, market size and evidence of demand.","max_words":200},{"id":"team","question":"Describe the team and the NSW base of operations.","max_words":150},{"id":"budget","question":"Provide the project budget, the 50% matched funding and its source.","max_words":150}]'::jsonb where id = 'nsw-mvp-ventures';
update public.au_grants set application_prompts = '[{"id":"startup_overview","question":"Describe the startup, the problem it solves and the Victorian connection.","max_words":250},{"id":"innovation","question":"What is innovative about the product and what evidence of traction do you have?","max_words":250},{"id":"use_of_funds","question":"How will the funding be used and what milestones will it reach?","max_words":250},{"id":"team","question":"Describe the founding team and why it will win.","max_words":200},{"id":"impact","question":"What jobs, revenue and investment will the business bring to Victoria?","max_words":150}]'::jsonb where id = 'vic-innovation-victoria';
update public.au_grants set application_prompts = '[{"id":"research_translation","question":"Describe the research you want to translate and the commercial opportunity.","max_words":300},{"id":"fellowship_plan","question":"What will you do during the fellowship — milestones, experiments, customer discovery?","max_words":250},{"id":"venture_potential","question":"Explain the venture potential: market, IP and route to first revenue.","max_words":200},{"id":"applicant","question":"Describe your background and why you are the person to lead this.","max_words":200}]'::jsonb where id = 'vic-breakthrough-fellowship';
update public.au_grants set application_prompts = '[{"id":"innovation","question":"Describe the innovative product or service and how it is different from existing solutions.","max_words":250},{"id":"market_validation","question":"Provide evidence of market validation: customers, pilots, revenue.","max_words":200},{"id":"project_plan","question":"Outline the project activities, milestones and how they lead to commercialisation.","max_words":250},{"id":"queensland_benefit","question":"What jobs and economic benefit will Queensland gain?","max_words":150},{"id":"budget","question":"Provide the budget and your co-contribution.","max_words":150}]'::jsonb where id = 'qld-ignite-ideas';
update public.au_grants set application_prompts = '[{"id":"business_overview","question":"Describe the Queensland business, its products and its position in the market.","max_words":250},{"id":"investment_use","question":"How would the investment be used and what growth would it fund?","guidance":"QIC invests alongside private capital — name the co-investors and round terms.","max_words":250},{"id":"traction","question":"Provide revenue, customer and pipeline evidence.","max_words":200},{"id":"queensland_impact","question":"What jobs, exports or supply-chain benefits will Queensland see?","max_words":200},{"id":"team","question":"Describe the leadership team and board.","max_words":150}]'::jsonb where id = 'qld-backing-business-investment-fund';
update public.au_grants set application_prompts = '[{"id":"business_overview","question":"Describe the Aboriginal and/or Torres Strait Islander business and its products or services.","max_words":250},{"id":"growth_activity","question":"What activity will the funding support and how does it grow the business?","max_words":200},{"id":"outcomes","question":"What outcomes will the project deliver for the business and community?","max_words":200},{"id":"budget","question":"Provide the project budget and any co-contribution.","max_words":150}]'::jsonb where id = 'qld-deadly-deals';
update public.au_grants set application_prompts = '[{"id":"project_summary","question":"Describe the collaborative regional project and the industry challenge it addresses.","max_words":300},{"id":"collaboration","question":"Name the collaborators (research, industry, community) and each party''s role.","max_words":200},{"id":"regional_impact","question":"What outcomes will regional Queensland see — jobs, capability, new products?","max_words":200},{"id":"budget","question":"Provide the budget and co-contribution from each partner.","max_words":200}]'::jsonb where id = 'qld-regional-futures';
update public.au_grants set application_prompts = '[{"id":"business_overview","question":"Describe the Tasmanian business, its trading history and current position.","max_words":250},{"id":"loan_purpose","question":"What will the loan fund and how does it grow the business?","max_words":200},{"id":"repayment","question":"Show how the business will service the loan: cash-flow forecast and existing debt.","max_words":250},{"id":"employment","question":"What Tasmanian jobs will be created or retained?","max_words":120},{"id":"security","question":"Describe the security offered and any existing bank finance.","max_words":120}]'::jsonb where id = 'tas-business-growth-loan';
update public.au_grants set application_prompts = '[{"id":"innovation","question":"Describe the new product, process or service and the problem it solves for the Territory.","max_words":250},{"id":"project_plan","question":"Outline the funded activities and milestones.","max_words":200},{"id":"outcomes","question":"What commercial and Territory outcomes will the project deliver?","max_words":150},{"id":"budget","question":"Provide the budget and your cash co-contribution.","max_words":120}]'::jsonb where id = 'nt-business-innovation-program';
update public.au_grants set application_prompts = '[{"id":"project_scope","question":"Describe the community infrastructure project, its location and the regional need it meets.","max_words":300},{"id":"community_benefit","question":"What economic, social and community benefits will the project deliver, and for whom?","max_words":250},{"id":"readiness","question":"Confirm land tenure, approvals, design status and construction readiness.","max_words":200},{"id":"budget","question":"Provide the total project cost, grant requested and co-contribution (in cash or in kind).","max_words":200},{"id":"partners","question":"List delivery partners, local government support and letters of support.","max_words":150}]'::jsonb where id = 'growing-regions-program';
-- END application_prompts seed

commit;

notify pgrst, 'reload schema';
