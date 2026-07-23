# Real-World Workflow Parity Audit — 2026-07-23

Founder brief: every demo, workflow, and per-startup process must mirror real deployments (Atlassian, Canva, Airwallex, Xero, Culture Amp), not stylised invented journeys. This is an audit only — no feature code touched.

---

## 1. Current-state inventory

| Surface | Taxonomy | Source of truth | Origin |
|---|---|---|---|
| SVI 13-criteria evaluation | 8 stages: Concept → Validated Idea → MVP/Prototype → Early Traction → Revenue → Growth → Scale → Corporation | `web/src/lib/svi-analysis.ts:13-22` (`SVI_STAGE_LABELS`) | Internally invented; the 13 criteria live in `svi-analysis.ts` (dimensions `lco/cgh/tre/ptd/mpc`) but no reference to any public VC framework |
| Growth Phases (12) | Vision → Idea Validation → Market Research → MVP → PMF → Revenue → Growth → Team & Culture → Funding-Ready → Fundraise → Post-Funding → Exit | `web/src/lib/showcase/gallery.ts:17-30` (`PHASE_LABELS`) mirrored in `web/src/lib/startup-growth-phases.ts:35+` and `web/src/lib/guide/startup-journey.ts:76-865` (12 chapter slugs) | Internally invented — comment at `showcase/gallery.ts:16` states "Aligned with U.9 12-phase journey matrix in docs/plans/reseller-module-plan.md" |
| SCN Navigation | 5 layers: Validation → Position → Value → Direction → Capital | `web/src/lib/scn-detect.ts:9` (docstring only); consumed by `web/src/app/api/scn/detect/route.ts` | Internally invented acronym; no external framework citation |
| 8-spiral platform roadmap | Idea → Validation → MVP & Valuation → Equity & Cap Table → Tokenization → Investment & Fundraise → Revenue & Dividends → Growth Journal & Revaluation | `~/.claude/.../memory/platform_roadmap.md`; unresolved 8↔12 bucket mapping at `docs/plans/reseller-module-plan.md:1374` and `docs/plans/plan-delta-2026-07-23.md:96` | Internally invented; two active taxonomies not reconciled in code |
| Data-room (workspace surface) | 6 categories × 21 items: Company Formation, Cap Table & Equity, Financials, Product & Tech, Market & Traction, Legal & Compliance | `web/src/app/workspace/data-room/page.tsx:38-71` (`DATA_ROOM_ITEMS`) | Internally invented; only 21 items — well short of real Series A checklists |
| Data-room (template library) | 10 sections: Corporate & Legal, Cap Table & Equity, Financial Projections, Product & Technology, Market & Traction, Team & Advisors, IP & Compliance, Contracts & Agreements, Strategy & Roadmap, References & Due Diligence | `web/src/lib/data-room-templates.ts:413-896` | Structure roughly matches VC dataroom norms but AU-specific compliance items (ATO, ESIC, AFSL, Fair Work) not enumerated |
| Demo showcase | Per-case timelines using the 12-phase `PHASE_NAMES` | `web/src/app/showcase/atlassian/page.tsx:18-31` + parallel `canva/`, `xero/`, `safetyculture/` | Real historical events with cited sources (RESEARCH.md); phase-tagging is our invented taxonomy overlaid on real events |
| Reseller "customer journey" | None — flat operational list only (columns: email, credits, code, created_at) | `web/src/app/reseller/customers/page.tsx:23-38` | No journey/stage tracking exists |
| Onboarding wizard | 5 steps: Segment → Goal → Tier → Trial → Payment | `web/src/app/onboarding/onboarding-wizard.tsx:4,177-182` | Purchase-funnel steps, not startup-journey steps |
| Reports / Guide | 12 chapters keyed to Growth Phases | `web/src/lib/guide/startup-journey.ts:76-865`; renderer at `web/src/app/guide/[chapter]/page.tsx` | Chapters match the invented 12-phase taxonomy |

Four overlapping taxonomies coexist (SVI-8, Growth-12, SCN-5, Roadmap-8) with no canonical map to any external, publicly recognisable stage vocabulary.

---

## 2. Real-world benchmarks

Compact 6-8 stage journeys. All non-cited claims marked "citation needed".

**Atlassian (2002 → NASDAQ 2015)**
1. Bootstrap Sydney, A$10K credit card, UNSW grads (2002) — Jira 1.0 shipped [en.wikipedia.org/wiki/Atlassian; atlassian.com/blog "20 years, 20 lessons"].
2. Self-serve US$1M ARR, no sales team (2003) — American Airlines faxes order [atlassian.com/blog].
3. Profitable + ShipIt hackathon (2005) [atlassian.com/blog "ShipIt"].
4. Governance chassis: Foundation + Pledge 1% (2006), core values codified (2007) [atlassian.com/company].
5. Accel Series A US$60M 100% secondary (Jul 2010) [techcrunch.com/2010/07/14/atlassian-accel-60-million/].
6. T. Rowe Price secondary US$150M @ US$3.3B (Apr 2014) [techcrunch.com/2014/04/08/...].
7. UK Plc reorganisation for dual-class (2014) [startupdaily.net].
8. IPO NASDAQ:TEAM US$21, US$462M raised, +32% pop, mcap US$5.8B (Dec 2015) [SEC S-1; en.wikipedia.org/wiki/Atlassian].

**Canva (2012 → 2021 US$40B)**
1. Fusion Books precursor + rejection tour (2007-2012) [smh.com.au founder interviews; canva.com/newsroom].
2. Blackbird + Matrix seed A$3M (2013) [afr.com; blackbird.vc portfolio].
3. Launch Canva.com Aug 2013 [canva.com/newsroom].
4. Sequoia + Blackbird Series A/B US$40M @ US$1B (Jan 2018) — unicorn [techcrunch.com/2018/01/08/canva-1b].
5. Canva for Enterprise + US$60M @ US$3.2B (2019) [techcrunch.com 2019].
6. US$71M @ US$15B (Sep 2020) [reuters.com].
7. US$200M @ US$40B (Sep 2021) [reuters.com/technology/canva-hits-40-billion-valuation].
8. US$26B down-round revaluation, still pre-IPO (2022) [afr.com; citation needed on exact structure].

**Airwallex (2015 → decacorn 2022)**
1. Melbourne coffee-shop origin story (2015) [afr.com founder profile].
2. Y Combinator W17 [ycombinator.com/companies/airwallex].
3. Sequoia + Tencent Series A US$13M (2017) [techcrunch.com].
4. Series B US$80M unicorn (Mar 2019) [reuters.com — Airwallex unicorn].
5. Series D US$100M (Sep 2020) [techcrunch.com].
6. Series E1 US$100M @ US$5.5B (Sep 2021) [reuters.com].
7. Series E2 US$100M @ US$5.5B (Nov 2022) — flat extension [afr.com; citation needed for decacorn label — public reporting caps at US$5.5B in 2022].
8. Series F US$300M @ US$6.2B (May 2025) [reuters.com; citation needed].

**Xero (2006 → ASX 2018)**
1. Wellington bootstrap, Rod Drury founding cheque (Jul 2006) [xero.com/about].
2. NZX IPO NZ$15M @ NZ$55M (Jun 2007) — pre-revenue listing [nzx.com XRO prospectus].
3. First profitable month + first 100k customers (2011) [xero.com annual report FY12].
4. US expansion + Peter Thiel/Matrix US$180M (Feb 2014) [nzherald.co.nz].
5. Accel + AMP US$100M (Oct 2015) [reuters.com].
6. ASX dual listing (Jun 2017) → ASX-only delist NZX (Feb 2018) [asx.com.au; xero.com investor releases].
7. ASX200 inclusion (Mar 2018) [asx.com.au; citation needed exact date].

**Culture Amp (2011 → 2021 unicorn)**
1. Bootstrap Melbourne, founder Didier Elzinga (2010-2011) [cultureamp.com/about].
2. Blackbird seed A$1M (2013) [blackbird.vc portfolio; citation needed on exact size].
3. Felicis + Index Series A US$6.3M (2015) [techcrunch.com 2015].
4. Sequoia Series B US$20M (2017) [afr.com].
5. Sapphire Series E US$82M (2019) [techcrunch.com].
6. Sequoia-led US$100M @ US$1.5B unicorn (Jul 2021) [reuters.com — Culture Amp unicorn].
7. Layoff-and-refocus reset (2023) [afr.com; citation needed].

---

## 3. Standard startup-to-unicorn taxonomy

VC/accelerator canonical 8-stage synthesis.

| # | Stage | Entry | Exit | Duration | Revenue | Team | Key artifacts | Common failure |
|---|---|---|---|---|---|---|---|---|
| 1 | Idea | Founder(s) + problem hypothesis | Written vision, ICP defined | 0-3mo | 0 | 1-2 | Vision statement, problem-solution canvas | No urgency / weak thesis |
| 2 | Validation (PMF search) | Vision + ICP | 10+ paid pilots or "hair-on-fire" letters | 3-12mo | 0-A$100K | 2-4 | Customer interviews log, LOIs | Building without talking to users |
| 3 | MVP / Early revenue | Validated problem | Live product, first paying customers | 3-9mo | A$0-500K ARR | 3-8 | MVP repo, first invoices, ToS/privacy | Feature bloat, no retention |
| 4 | Seed (PMF) | Repeatable sales | 40% "very disappointed" (Sean Ellis test) or NRR >100% | 6-18mo | A$300K-1.5M ARR | 5-15 | Seed deck, SAFE/priced round, cap table | Hitting scale without PMF |
| 5 | Series A (growth) | PMF proven | US$5-10M ARR, T2D3 pace | 12-24mo | A$1-5M ARR | 15-40 | Series A deck, VC dataroom, employment IP deeds | Premature scaling |
| 6 | Series B/C (scale) | Repeatable GTM | US$25-100M ARR | 12-36mo | A$10-100M | 40-250 | Board pack, ESOP top-up, subsidiary structure | Burn > growth |
| 7 | Late-stage (pre-IPO) | Path to profitability | Audited financials 2 yrs | 12-36mo | A$100M+ | 250-2000 | S-1 draft, Big-4 audit, SOX-lite controls | Down-round / secondary only |
| 8 | Public / Exit | Bankability | Listing or acquisition close | 6-24mo | — | 500+ | Prospectus, SPA, escrow | Withdrawn IPO / regulator block |

---

## 4. Data-room standard checklist

Standard AU Series A / acquirer request list. Maps to current blockid.au dataroom surface.

| Category | Typical asks | Current blockid.au coverage |
|---|---|---|
| Corporate | ASIC company extract, constitution, board minutes, ACN/ABN, director consents, register of members, register of charges | Present at `data-room-templates.ts:415-486` (§1 Corporate & Legal); ASIC extract explicit at :433; **missing: register of charges, director consents** |
| Financial | Audited P&L 3 yrs, management accounts, budget vs actuals, tax returns, bank statements 6 mo, revenue proof, aged debtors, cohort/MRR | Partial at `data-room-templates.ts:555-624` (§3); **missing: aged debtors, budget-vs-actual, audited history** |
| Legal | Terms of service, privacy policy, customer contracts, supplier contracts, litigation register, insurance schedules | Partial at :818-858 (§8 Contracts); **missing: litigation register, insurance schedules** |
| IP | IP assignment deeds (founders + contractors), trademark/patent register, open-source-usage log, domain register | Partial at `web/src/app/workspace/data-room/page.tsx:60` (ip_assignment only) + :768-817 (§7); **missing: OSS usage log, domain register** |
| Commercial | Top-10 customer contracts, churn cohort, sales pipeline, CAC/LTV, MSAs, partner/reseller agreements | Partial at :676-733 (§5); **missing: partner agreements, MSA templates** |
| HR | Employment contracts + IP deeds, ESOP register, org chart, leave/entitlement liability, Fair Work compliance | Partial at :734-767 (§6 Team); **missing: Fair Work entitlement schedule, leave liability** |
| Tax | BAS lodgements 8 quarters, R&D tax offset filings, ATO ICA extract, tax residency, transfer pricing | **Not present** — no dedicated tax folder |
| Technical | Architecture doc, security policy, SOC 2 / ISO 27001 status, incident register, SLA/uptime, penetration test | Partial at `data-room-templates.ts:626-675` (§4); **missing: incident register, pen-test report** |
| AU-specific | ESIC/ESVCLP qualifying-company evidence (Div 360-40), AFSL/AR licence where money-flowing, Privacy Act 1988 attestation, Fair Work compliance, ATO tax residency | **Not present as first-class checklist items** — spread across §7 IP & Compliance :768-817 as generic entries |

---

## 5. Gap analysis

| Current-state taxonomy | Real-world benchmark | Gap | Ship-ready remediation | Scope |
|---|---|---|---|---|
| SVI-8 stages `svi-analysis.ts:13` | Canonical 8-stage (Idea → Public/Exit) | Labels ("Corporation") don't match VC vocabulary ("Public/Exit") | Rename `SVI_STAGE_LABELS` to VC-canonical + regen benchmark bands | S |
| Growth-12 phases `showcase/gallery.ts:17` | 6-8 stage per real case | 12 phases have no external referent; showcase cases forced into 12 buckets | Publish a bucket-map between 12-phase (internal storage) and 8-canonical (display) — H.21 already recommends this at `docs/plans/plan-delta-2026-07-23.md:96` | M |
| SCN 5-layer `scn-detect.ts:9` | No VC framework uses "SCN" | Invented acronym alienates advisors | Rename or explicitly cite as a BlockID-proprietary lens; document the mapping to canonical | S |
| 8-spiral roadmap (memory only) | Real journeys don't include "Tokenization" as a mandatory stage | Roadmap conflates platform capability with founder journey | Split "platform capability roadmap" from "founder journey" — remove tokenization/dividends from customer-facing journey | M |
| Data-room 21-item `data-room/page.tsx:38` | Real Series A checklists have 60-120 items | 21 items misses tax, HR entitlements, ESIC, AFSL, litigation, insurance | Extend `DATA_ROOM_ITEMS` to include Tax + AU-specific + missing HR/Legal | M |
| Data-room 10-section template `data-room-templates.ts:413` | Standard 8-category + AU-specific | No first-class Tax section; ESIC/AFSL not enumerated | Add §11 Tax + §12 AU Compliance to `DATA_ROOM_STRUCTURE` | M |
| Reseller "customer journey" `reseller/customers/page.tsx:23` | Reseller CRMs track stage (Trial → Active → Growth → Renewal) | No journey tracked at all | Add `customer_stage` column + drawer view | M |
| Onboarding 5-step `onboarding-wizard.tsx:4` | Real product-led onboarding uses in-product tour after Payment | Ends at Payment; no "first startup created" milestone | Add Step 6 "Create your first startup profile" wired to `/reseller/create-startup` pattern | S |
| Showcase timelines `showcase/atlassian/page.tsx` | Real events cited correctly | Phase tagging uses internal 12-taxonomy; readers can't compare across cases | Overlay canonical 8-stage badges alongside 12-phase | S |
| Guide chapters `guide/startup-journey.ts:76-865` | 12 chapters mirror invented 12-phase | Same taxonomy leak into user-facing content | Add "Where real founders were at this chapter" callout per chapter (Atlassian/Canva/etc.) | L |

---

## 6. Prioritised remediation worklist

1. **Publish canonical 8-stage vocabulary** — Section 3 above. Files: `web/src/lib/svi-analysis.ts:13-22`, `web/src/lib/showcase/gallery.ts:17-30`, memory `platform_roadmap.md`. Skill: `architecture-designer`. Scope S. **Ship-now** with founder sign-off on labels.
2. **Wire 12↔8 bucket map** (H.21 already recommended, `docs/plans/plan-delta-2026-07-23.md:96`). Files: new `web/src/lib/journey-map.ts`, consumers in `showcase/gallery.ts`, `startup-growth-phases.ts`, `guide/startup-journey.ts`. Skill: `typescript-pro`. Scope M. **Ship-now.**
3. **Extend data-room to 60+ items with AU compliance** — Section 4 gaps. Files: `web/src/app/workspace/data-room/page.tsx:38-71`, `web/src/lib/data-room-templates.ts:413`. Skill: `au-compliance`. Scope M. **Founder review** required on ESIC/AFSL wording.
4. **Add Tax + AU-Compliance sections to template library**. File: `web/src/lib/data-room-templates.ts:413-896`. Skill: `au-compliance`. Scope M. **Ship-now.**
5. **Overlay canonical-stage badges on 4 showcase cases**. Files: `web/src/app/showcase/{atlassian,canva,xero,safetyculture}/page.tsx`. Skill: `react-expert`. Scope S. **Ship-now.**
6. **Add Airwallex + Culture Amp showcases** (currently absent — only 4 exist). Files: new `web/src/app/showcase/{airwallex,culture-amp}/page.tsx` + `docs/showcase/*/RESEARCH.md`. Skill: `deep-research` then `react-expert`. Scope L. **Founder review.**
7. **Add reseller `customer_stage` tracking**. Files: `web/src/app/reseller/customers/page.tsx:23`, new migration under `web/supabase/migrations`, `web/src/lib/reseller/supabase.ts`. Skill: `db-migrate` + `fullstack-guardian`. Scope M. **Founder review** on stage vocabulary.
8. **Add Step 6 to onboarding wizard: "Create first startup"**. File: `web/src/app/onboarding/onboarding-wizard.tsx:177-182` + new `components/onboarding/step-first-startup.tsx`. Skill: `nextjs-developer`. Scope S. **Ship-now.**
9. **Rename SCN externally to BlockID-proprietary + cite framework overlays**. Files: `web/src/lib/scn-detect.ts:9`, `web/src/app/api/scn/detect/route.ts`. Skill: `code-documenter`. Scope S. **Ship-now.**
10. **Add "Real founder was here" callouts to each of 12 guide chapters**. File: `web/src/lib/guide/startup-journey.ts:76-865` (12 chapters). Skill: `deep-research` + `typescript-pro`. Scope L. **Founder review** on tone.

---

_Audit only. No non-doc files modified._
