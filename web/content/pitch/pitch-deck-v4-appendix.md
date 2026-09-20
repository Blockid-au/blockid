---
version: "A4"
kind: "appendix"
date: 2026-09-20
entity: "Auschain PTY LTD"
acn: "659 615 111"
brand: "BlockID — Appendix"
byline: "Evidence-backed startup assessment infrastructure"
ask: "reference material — not part of the ask"
audience: "Accelerators, startup programs and professional evaluators — backup detail for deck v4"
positioning: "Five reference slides behind the pitch: full feature set, methodology, valuation approach, legal identity and data ownership, architecture."
render: "web/scripts/generate-pitch-deck-v4.ts --appendix → web/public/pitch/BlockID-Pitch-Appendix-2026-09.pptx"
---

# BlockID — Appendix to deck v4 (2026-09-20)

Backup detail for `pitch-deck-v4.md`, in the same one-`yaml`-block-per-slide format. Table rows are block lists of maps (never flow `[a, b, c]` lists — the yaml-subset parser splits flow lists on every raw comma). These slides are handed out, not spoken: no 3-minute allocation, no per-slide word ceiling, but the same wording guardrails apply (no agent counts, no A$3 anchor, no "PhD", no "predict", no "beta", entity from `lib/site/legal-entity.ts`) and every number still has a home in `## Provenance`.

## Slide 1 — Full feature set by layer

```yaml
title: Full feature set by layer
sub: The four layers the product is built on — what is live today
hero:
  type: table
  description: One table — layer, what it holds, live surfaces
  data:
    tables:
      - heading: "Layers L1–L4 (the G21 upgrade plan § 0)"
        columns: [Layer, What it holds, Live surfaces]
        rows:
          - layer: L1 Business identity
            holds: Verified business profile — ABN / ACN lookup, domain check, verification levels L0–L5, BlockID Verified badge
            live: /business-id · /id/[slug] · verification level on every report cover
          - layer: L2 Evidence graph
            holds: Claims separated from evidence — origin, verification level, reviewer approval, expiry, hash-chained audit trail
            live: evidence upload · connectors (Stripe, Xero, GitHub, GA4) · reviewer queue
          - layer: L3 Assessment engine
            holds: Startup Value Index — eight dimensions, each with score, weight, confidence, evidence, missing items, benchmark and next action
            live: /analyze · Trusted Business Report · score ledger · valuation range
          - layer: L4 Decision and progress
            holds: BlockID Dossier, BlockID Cohort (intake link, batch scoring, cohort table, CSV), sponsor / LP report, feedback letters, decision log, API
            live: /workspace/evaluations · /workspace/accelerator · /apply/[slug] · Evaluator API
speaker: Reference only.
clusters: [C8]
sources:
  - docs/plans/g21-fi-upgrade-2026-09-20.md § 0 (four layers) and § 1 (baseline)
  - docs/ops/feature-inventory.md
```

## Slide 2 — Methodology

```yaml
title: Methodology
sub: Public at blockid.au/methodology and blockid.au/methodology/governance
hero:
  type: table
  description: Two tables — the eight dimensions with their owner lens, and the evidence ladder with confidence values
  data:
    tables:
      - heading: "Eight dimensions (dimension-owners.ts) — weights are fixed per methodology version and shown to authenticated evaluators inside every report"
        columns: [Code, Dimension, Owner lens]
        rows:
          - code: FTV
            name: Founder & Team Value
            owner: CHRO
          - code: MPC
            name: Market Pull & Category
            owner: CMO
          - code: PTD
            name: Product & Tech Depth
            owner: CTO
          - code: TRE
            name: Traction & Revenue Evidence
            owner: CRO
          - code: CGH
            name: Capital & Governance Health
            owner: CFO
          - code: IRI
            name: Investor Readiness Index
            owner: CLO
          - code: LCO
            name: Legal & Compliance
            owner: CLO
          - code: SVM
            name: Strategic Vision & Moat
            owner: CEO
      - heading: "Evidence ladder (svi-analysis.ts EVIDENCE_CONFIDENCE) — who may set each level is capped by origin"
        columns: [Level, Confidence, Set by]
        rows:
          - level: self_declared
            confidence: "0.20"
            by: founder text
          - level: public_url
            confidence: "0.35"
            by: founder text with a public link
          - level: document_uploaded
            confidence: "0.50"
            by: founder upload
          - level: connected_source
            confidence: "0.75"
            by: connector
          - level: transaction_data
            confidence: "0.90"
            by: connector (source of record)
          - level: third_party_verified
            confidence: "1.00"
            by: named BlockID reviewer, audit-logged
speaker: Reference only.
clusters: [C5]
sources:
  - web/src/lib/report-pipeline/dimension-owners.ts (titles, owners)
  - web/src/lib/svi-analysis.ts (EVIDENCE_CONFIDENCE)
  - web/src/lib/evidence/confidence-cap.ts (CAP_RULES_PLAIN)
  - docs/product/score-governance.md
```

## Slide 3 — Valuation approach

```yaml
title: Valuation approach
sub: A range with its method on the page — information, not advice
hero:
  type: table
  description: One table — method, when it applies, what the report shows
  data:
    tables:
      - heading: "Methods the CFO module runs (lib/agents/cfo-valuation.ts) — the report shows the inputs and assumptions table"
        columns: [Method, Applies when, What the reader sees]
        rows:
          - method: Scorecard / stage anchors
            when: Pre-revenue — anchored on Australian stage medians, adjusted by dimension scores
            sees: A range, the anchor used and the adjustments, labelled pre-revenue
          - method: Revenue multiples
            when: Revenue evidence at connected-source level or better
            sees: Multiple band, the revenue figure and its verification level
          - method: Comparable raises
            when: Curated Australian comparables at the same stage and sector
            sees: The comparables used and how far the company sits from them
          - method: Discounted cash flow
            when: Projections supplied with assumptions the reader can change
            sees: The assumptions table, the sensitivity and the resulting range
          - method: Disagreement
            when: Always
            sees: Where the methods disagree and why — the range is honest about it
speaker: Reference only.
clusters: [C5]
sources:
  - web/src/lib/agents/cfo-valuation.ts
  - web/src/lib/au-comparable-raises.ts
  - web/src/lib/report-v2/schema.ts (inputs and assumptions, G19-S42)
  - docs/design/messaging.md § 10 (disclaimer sentence)
```

## Slide 4 — Legal identity and data ownership

```yaml
title: Legal identity and data ownership
sub: One entity on every page, invoice, PDF and JSON-LD block
hero:
  type: table
  description: One table — item, value, where it is enforced
  data:
    tables:
      - heading: "lib/site/legal-entity.ts is the one source; legal-entity.test.ts fails on stray literals"
        columns: [Item, Value, Enforced by]
        rows:
          - item: Seller of record
            value: Auschain PTY LTD · ACN 659 615 111 · ABN 79 659 615 111 · Sydney NSW
            by: LEGAL_ENTITY.operator — invoices, GST, Stripe merchant, privacy and terms owner
          - item: Data ownership
            value: Your data belongs to your startup. Consent tiers control who sees what.
            by: DATA_PRINCIPLE_SENTENCE — consent scope honoured on every evaluator read
          - item: Verification
            value: Business verification L0–L5; evidence levels capped by origin; reviewer approvals audit-logged
            by: level-engine.ts · confidence-cap.ts · audit chain
          - item: Score disclaimer
            value: Scores and valuation ranges are information, not financial, legal or investment advice.
            by: docs/design/messaging.md § 10 on every report and PDF cover
          - item: Corrections
            value: Founder flags → logged → new report version; overrides never silent
            by: docs/product/score-governance.md § 9–10
speaker: Reference only.
clusters: [C10]
sources:
  - web/src/lib/site/legal-entity.ts
  - web/src/lib/valuation-certificate/types.ts (DATA_PRINCIPLE_SENTENCE)
  - docs/product/score-governance.md
```

## Slide 5 — Architecture

```yaml
title: Architecture
sub: Deterministic score, narrative by model, everything recorded
hero:
  type: table
  description: One table — component, role, provenance
  data:
    tables:
      - heading: "Pipeline (report-pipeline/*) — the score never touches a language model; narrative chapters record the model that produced them"
        columns: [Component, Role, Provenance]
        rows:
          - component: Intake
            role: Form, deck, website or business identifier → structured evidence rows
            provenance: Origin and verification level stored per row
          - component: Score engine
            role: Deterministic Startup Value Index — eight dimensions, ledger, confidence, verification multiplier
            provenance: SVI_VERSION stored on every snapshot and report
          - component: Narrative
            role: Specialised analysis per dimension, then an auditor pass for grounding
            provenance: Model per chapter, auditor stamp, uncited-statement count
          - component: Audit trail
            role: Append-only, hash-chained log of every mutating call; nightly re-verification
            provenance: audit_chain status on /status
          - component: Storage
            role: Self-hosted Postgres with row-level security; projects-only foreign keys; founder-consent scope
            provenance: Migration ledger; weekly restore drill
          - component: Delivery
            role: Web report, PDF, DOCX, share links, Evaluator API, cohort CSV, sponsor report
            provenance: Report keeps the versions it was produced with
speaker: Reference only.
clusters: [C8]
sources:
  - web/src/lib/report-pipeline/version.ts
  - web/src/lib/audit/chain-verify.ts
  - docs/ops/db-migrations.md
  - web/src/lib/i18n/messages/en.json (methodology.provenance.p1 / p2)
```

## 3-minute cut

Not spoken — appendix slides are handed out. The table is kept so the shared parser accepts the file.

| # | Slide | Time | Seconds | Beat |
|---|---|---|---|---|
| 1 | A1 — Full feature set | — | 0 | reference |

### Script

Reference material only.

## Provenance

| Number | Slide | Source file / URL | Note |
|---|---|---|---|
| L0–L5 · 0 · 5 (verification levels) | 1, 4 | `web/src/lib/verification/level-engine.ts`; `web/src/lib/verification/confidence-multiplier.ts` | |
| L1–L4 · 1 · 2 · 3 · 4 (layers) | 1 | `docs/plans/g21-fi-upgrade-2026-09-20.md` § 0 | |
| 0.20 · 0.35 · 0.50 · 0.75 · 0.90 · 1.00 (evidence ladder) | 2 | `web/src/lib/svi-analysis.ts` `EVIDENCE_CONFIDENCE` | |
| 659 615 111 (ACN) · 79 659 615 111 (ABN) | 4 | `web/src/lib/site/legal-entity.ts` | test asserts parity with the config |
| 9–10 · 9 · 10 (governance sections) | 4 | `docs/product/score-governance.md` | section numbers |
