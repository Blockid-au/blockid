# Atlassian demo — visitor walkthrough guide

> A 9-step guided tour that replays Atlassian's 2002–2026 journey through
> every BlockID surface a founder would actually use. Anonymous. No login.
> ~10 minutes end to end.
>
> Live: [`/showcase/atlassian?step=1`](https://blockid.au/showcase/atlassian?step=1)

---

## How to use this demo

The Atlassian demo is BlockID's way of showing the platform without asking
anyone to sign up first. Every page you see is a real BlockID mirror page
— the same components that render your own workspace — populated with
Atlassian's public disclosures instead of your data. The story is
Cannon-Brookes and Farquhar bootstrapping a A$10K credit card into a
NASDAQ:TEAM listing with zero founder dilution, mapped onto BlockID's
12-phase founder journey.

You can walk it in three ways. **Sequentially** — click "Start walkthrough
→" on the landing page and use the sticky top-bar Prev/Next buttons (or
arrow keys) to move through steps 1 → 9. **Directly** — every step has a
canonical URL (`?step=N`), so `/showcase/atlassian/svi-report?step=3`
deep-links straight to the SVI screen. **Randomly** — the landing page
timeline lets you jump into any phase; each phase card is also linked
from the summary and guide pages. Escape at any time returns to the
landing page.

## The 9 steps

### Step 1 — Landing: the founder story
- **URL:** `/showcase/atlassian?step=1`
- **You see:** Atlassian's 24-year story on one page — bootstrap Sydney
  to NASDAQ, two secondaries (Accel 2010, T. Rowe 2014), IPO 2015 with
  96.7 % founder voting power retained, and a milestone-by-phase timeline
  populated from `web/src/lib/showcase/atlassian/fixture.ts`.
- **In real life a founder would…** land on `/showcase/blockid` first
  (BlockID's own showcase), then click through to `/register` to create
  their own workspace at `/svi`. This step is the marketing surface — the
  one screen that decides whether the visitor spends the next ten
  minutes with us.
- **Sources:** `ATLASSIAN_DEMO.profile`, `ATLASSIAN_DEMO.milestones[0..4]`
  (2002 founding, Jira v1.0, first US$1M, Confluence v1.0, first
  profitable year), Wikipedia + Atlassian 20-lessons blog.

### Step 2 — Living dashboard
- **URL:** `/showcase/atlassian/dashboard?step=2`
- **You see:** What BlockID would show your own startup: current phase
  card, milestone timeline, agent activity, SVI sparkline — but
  populated by Atlassian's real timeline data.
- **In real life a founder would…** open `/dashboard` after signing in.
  The dashboard is the recurring workspace surface — the one page a
  founder returns to every Monday morning to see the previous week's
  delta.
- **Sources:** `ATLASSIAN_DEMO.milestones` (20 rows), `ATLASSIAN_DEMO.
  phaseSnapshots` (12 rows) — every milestone carries a live citation
  URL back to the original press release, TechCrunch or SEC filing.

### Step 3 — SVI score: 13 criteria
- **URL:** `/showcase/atlassian/svi-report?step=3`
- **You see:** BlockID's SVI grading Atlassian across all 13 criteria
  (idea, market, founder profile, code/git, website, team, customer
  size, GTM, documents, data room, team structure, roadmap, revenue).
  Each criterion shows a 0–100 score and a one-line rationale citing a
  specific milestone.
- **In real life a founder would…** answer the 13-criterion questionnaire
  themselves at `/svi`, then read the same-shape report about their own
  startup. The score is not the point — the per-criterion breakdown is
  the point, because that's where the founder learns which two criteria
  to focus on next.
- **Sources:** `ATLASSIAN_DEMO.sviScores` (13 rows), each linking back to
  a milestone in the fixture; the aggregate composite (mean = ~91/100)
  is computed on the summary page.

### Step 4 — 12-phase growth map
- **URL:** `/showcase/atlassian/growth-phases?step=4`
- **You see:** All 12 phases (Vision → Idea Validation → Market Research
  → MVP → PMF → Revenue → Growth → Team & Culture → Funding-Ready →
  Fundraise → Post-Funding → Exit) with one card per phase showing what
  Atlassian actually did — and a comparison with the phase-mismatch
  trap most founders fall into.
- **In real life a founder would…** open `/growth-phases` after their
  SVI puts them at a specific phase. The map is a diagnostic — it tells
  you *where* you are so the advice you get is calibrated for your
  moment, not a generic "how to start a startup" pack.
- **Sources:** `ATLASSIAN_DEMO.phaseSnapshots` (12 rows), each with an
  `atlassianMoment` and an `sviAtThisPoint` estimate; sources trace to
  Wikipedia, TechCrunch, and the Atlassian 20-lessons post.

### Step 5 — C-Level agent panel
- **URL:** `/showcase/atlassian/agents/ceo?step=5`
- **You see:** Seven C-Level AI agents (CEO, CFO, CTO, CMO, COO, CHRO,
  CLO) each write a 200–500 word briefing on Atlassian's journey — each
  briefing lands at the phase where that agent's advice would have
  mattered most (CEO at Phase 1, CTO at Phase 4, CFO at Phase 10, etc).
  Click through the tabs to compare perspectives on the same journey.
- **In real life a founder would…** invoke a specific agent from their
  workspace when they hit a phase-specific question ("we're raising Seed
  — what does the CFO agent say?"). Each briefing costs credits, which
  is why they're pre-computed here for demo purposes.
- **Sources:** `ATLASSIAN_DEMO.agentReports` (7 rows, Markdown
  briefings with per-report citation lists). The CFO's 2010 briefing on
  the Accel secondary and the CLO's 2014 briefing on the UK Plc
  reorganisation are especially concrete.

### Step 6 — Investor data-room mirror
- **URL:** `/showcase/atlassian/data-room?step=6`
- **You see:** The structure of a typical AU-first investor data room
  (12 categories from Corporate & Legal through AU Compliance),
  populated with Atlassian's actual public disclosures where available
  (S-1, 10-K, Scheme of Arrangement) and marked "redacted" or
  "inferred" where the private version is not disclosable.
- **In real life a founder would…** build their own data room at
  `/data-room` — the auto-DataRoom agent creates the folder structure
  and pre-populates every row we can from the SVI answers. Founders add
  the private evidence themselves, gated on their own consent.
- **Sources:** `ATLASSIAN_DEMO.dataRoomRows` (65 rows across 12
  categories per `web/src/lib/data-room-templates.ts:DATA_ROOM_STRUCTURE`);
  live SEC / businesswire / TechCrunch URLs on the `present` rows.

### Step 7 — Valuation methods side-by-side
- **URL:** `/showcase/atlassian/valuation?step=7`
- **You see:** Four valuation methods (DCF, Berkus, Scorecard,
  Comparables) applied at four points in Atlassian's history (2005 first
  profitable year, 2010 Accel round, 2015 IPO, 2026 current) — 16
  snapshots that make it obvious which method fits which phase (Berkus
  stops applying past PMF, DCF only becomes credible once you have
  revenue, Comparables is the IPO gold standard).
- **In real life a founder would…** open `/valuation` and pick the
  method the CFO agent recommends for their current phase. BlockID
  doesn't publish a single "your startup is worth X" number — it
  publishes a range across methods, with the phase-appropriate primary.
- **Sources:** `ATLASSIAN_DEMO.valuations` (16 rows, each with `fxRate`
  and a per-row narrative); AUD figures with the source USD converted
  at the historical exchange rate for that year.

### Step 8 — 12-chapter mentor guide
- **URL:** `/showcase/atlassian/guide?step=8`
- **You see:** BlockID's `/guide` output, replayed against Atlassian.
  Every one of the 12 chapters (from
  `web/src/lib/guide/startup-journey.ts`) is overlaid with what
  Atlassian actually did at that chapter — the phase snapshot in a
  callout box, the relevant milestones as clickable dots, and a link
  back into the growth-phases page for the deeper view.
- **In real life a founder would…** open `/guide` in their workspace
  and see the same 12 chapters written against *their* phase, *their*
  agents, *their* evidence gaps. The overlay here is a preview of the
  authoring style; the real guide is bilingual (EN + VI) and personal.
- **Sources:** `listChapters()` from
  `web/src/lib/guide/startup-journey.ts` × `ATLASSIAN_DEMO.
  phaseSnapshots` × `ATLASSIAN_DEMO.milestones`.

### Step 9 — Wrap-up: your turn
- **URL:** `/showcase/atlassian/summary?step=9`
- **You see:** Recap grid pointing back at all 8 earlier steps, a KPI
  strip (24-year timeline, 20 milestones, 12 phases, 91/100 SVI mean,
  A$8.0B IPO valuation, A$33.0B current valuation), three next-step
  CTAs (register / demo / other case studies), and a closing note from
  a founder-mentor register on why publishing your work publicly matters.
- **In real life a founder would…** hit `/register` from here — the
  primary CTA — or book a live demo. The summary page is where visitor
  interest converts into a workspace or a calendar hold.
- **Sources:** aggregate KPIs from all six `ATLASSIAN_DEMO` collections;
  the closing note paraphrases Cannon-Brookes' 2018 fireside remarks on
  publishing pricing and metrics publicly.

## For investors

If you are evaluating BlockID as an investment, the Atlassian demo is
the fastest way to judge the quality of the platform's guidance without
needing a live founder to walk it. Every screen you'd want to see — the
dashboard, the SVI report, the 12-phase map, the seven C-Level agent
briefings, the data room, the valuation methods, the mentor guide, the
wrap-up — is fully rendered against a well-understood public reference
(Atlassian's own SEC filings and press disclosures). What you're really
judging is not "did they get Atlassian right?" — you can check that
yourself against the citation URLs on every row — but "does the framing,
the structure, the writing register, and the compositional coherence
across nine screens look like something a founder would actually pay to
use?"

The demo is deliberately not gated. No email capture, no login wall, no
sales-triggered "book a demo" popup. Everything is server-rendered,
fully citable, and reproducible from the fixture module. If we had to
hide it behind a lead form the way most B2B SaaS competitors do, that
would tell you something about how confident we are in the underlying
quality. We're not hiding it — that should tell you the opposite.

## For resellers

Reseller partners (accelerators, incubators, professional-services
firms) can point prospective founders at the Atlassian demo as a
zero-friction sales asset. The pitch writes itself: "before you spend
an hour on the SVI questionnaire, spend ten minutes on this demo — it
shows what your report will look like when you're done." Because the
demo is public, the reseller can share the URL in email, on LinkedIn,
in a cohort welcome pack, or embed it in a partner portal. Attribution
still works — the reseller's `?via=<code>` parameter carries through
every internal `/register` link, so a demo view that converts to a
signup is credited back to the reseller under the P2 redemption
attribution scheme.

For a reseller cohort demo (e.g. an accelerator pre-cohort briefing),
walking the 9 steps live is a 15-minute session that reliably produces
questions from founders about their own workspace. The step-by-step
sticky top bar is designed for exactly this — the presenter clicks
Next, the founders follow along, and the closing summary points them
straight at the reseller-attributed signup URL.

---

**Related plans:**

- Goal document: [`docs/plans/atlassian-standard-mapping-goal.md`](../plans/atlassian-standard-mapping-goal.md) — 13-task breakdown, gap matrix, data-room map, nudge-engine spec.
- Research brief: [`docs/showcase/atlassian/RESEARCH.md`](../showcase/atlassian/RESEARCH.md) — every citation URL, 3 parallel research subagents, compiled 2026-07-21.
- Source of truth: [`docs/plans/SOURCE-OF-TRUTH.md`](../plans/SOURCE-OF-TRUTH.md) — see the "Atlassian demo walkthrough" audit item for shipment provenance.
