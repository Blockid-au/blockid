# Goal: AU Accelerator Knowledge Base + Guideline Engine

> **Created:** 2026-06-18 · **Owner:** CEO · **Status:** in_progress · **Target ship:** v2.12 / 2026-06-19

## Why this exists

Every AU founder we serve is implicitly being evaluated against the same playbook:
Antler / Startmate / Y Combinator / Techstars / SkyDeck / MVi / Cicada. They publish
public criteria, milestone gates, and rejection patterns — but the founder has to
go read them across 8 different sites + listen to 50 hours of YC office hours.

BlockID's edge: **bake that knowledge into the SVI engine and surface it as
guidelines the founder can act on every week**. Each criterion the accelerator
weighs becomes a row in our knowledge base that:

1. evaluates the user's current SVI / Antler signals against the criterion,
2. surfaces a stage-appropriate "do this next" action, and
3. updates the valuation upward when the criterion is met (auditable lift).

## The 8 accelerators in scope (Phase 1)

| Accelerator | Stage focus | What they publish | Owner |
|---|---|---|---|
| Antler | pre-seed (idea → Stage 1) | "5 progression signals" (Team/Progress/Invention/Vision/10× Product) | CDO |
| Startmate | AU seed (B2B SaaS) | "Founder × Market × Traction" matrix; AUD$1k MRR / 4 weeks of growth | CMO |
| Y Combinator | global pre-seed → seed | YC Application + Office Hours notes; "do things that don't scale" canon | R&D |
| Techstars | global seed (vertical) | Mentor Magic framework; OKR rigour; corporate-partner alignment | CRO |
| SkyDeck (Berkeley) | seed → Series A (deep tech) | IP defensibility + technical leap evidence | CDO |
| MVi (Melbourne Uni) | pre-incorporation | university IP, founder/researcher pairing | CHRO |
| Cicada Innovations | deep tech seed | physical product / regulated industry readiness | CLO |
| Blackbird Pre-seed | AU seed → Series A | sector reports, AU-specific multiples | CFO |

Phase 2 (after first ship): MaC Venture Partners, AirTree Open Source, Hawke's Brew.

## Deliverables (v2.12)

1. **DB migration `0065_knowledge_entries.sql`** — `knowledge_entries` table with:
   - `source` (accelerator slug) · `topic` · `stage_min` / `stage_max`
   - `criterion` (one-line what they measure) · `evidence_required` (text[])
   - `valuation_lift_pct` (estimated mid-band lift when criterion is met)
   - `tactic` (3-step "how to fulfil it" guide) · `citations` (URLs)
   - `published_at` · `last_verified_at`

2. **Seed file** `web/content/knowledge-base/au-accelerators-2026.json` —
   30+ rows seeded from public sources (Antler blog, Startmate blog, YC essays,
   Techstars handbook). Each row CITES its source.

3. **API** `/api/knowledge-base/accelerator`:
   - `GET ?stage=N&sector=X` → relevant criteria for the user's startup
   - `POST { sviSlug }` → run evaluation matrix and return `met` / `partial` / `gap`
     per criterion + recommended next 3 actions

4. **Dashboard card** on `/dashboard/svi`:
   - "Accelerator Readiness Map" — heatmap of 8 accelerators × Pass/Fail-criteria
   - Click any cell → drills into the criterion with evidence required + tactic

5. **Standalone page** `/dashboard/accelerator-criteria` — full searchable list
   filtered by stage / sector / source. Beta tag.

6. **SVI report PDF** — new page after SCN action plan: "Accelerator-Ready
   Checklist" pulling the 5 highest-leverage criteria for the user's stage.

## C-Level assignment (per CEO routine)

- **CDO** (Chief Data Officer): owns the schema + JSON seed file + freshness
  (last_verified_at). Quarterly re-verification cron.
- **CMO**: source new accelerator blog posts, distil into criteria. Each new
  source = 1 PR with citations.
- **CTO**: build the `/api/knowledge-base/accelerator` route + SVI matrix
  evaluation logic.
- **CPO**: design the dashboard card UX + standalone page IA + PDF page.
- **CFO**: calibrate `valuation_lift_pct` per criterion against the deep-valuation
  engine. Sanity-check that "ESOP + advisors + 100 weekly users" sums to a
  realistic A$ lift, not double-counted with existing lenses.
- **CRO**: A/B test the dashboard card placement — does the heatmap drive
  more "complete a criterion" CTAs than a list view?
- **CLO**: legal review of any citation usage (we link out, not republish).
- **IR (Investor Relations)**: cross-check criteria with VCs in Cut Through
  Venture top-30 to validate "what AU investors actually weight".

## Success criteria (definition of done for v2.12)

- 30+ knowledge entries seeded with citations
- API answers `<200ms` p95 from production
- Dashboard heatmap renders for any SVIAnalysis (gracefully empty if KB miss)
- PDF "Accelerator Checklist" page in every emailed report from v2.12
- At least 3 criteria show `valuation_lift_pct > 0` and that lift is reflected
  in the SCN "valuation levers" output
- Tagged Beta in sidebar nav

## Anti-patterns

- Don't scrape accelerator sites — manually curate from public posts + cite.
- Don't push a criterion as "must do" — frame it as "this accelerator weights X".
- Don't double-count: if a criterion overlaps with an existing SVI dimension,
  raise the existing dimension, don't add a second tally.
- Don't hide the source — every recommendation links to the originating post.

## Out of scope (Phase 2+)

- Application form generators (one per accelerator)
- Investor-bond CRM
- Auto-submission to YC etc.
