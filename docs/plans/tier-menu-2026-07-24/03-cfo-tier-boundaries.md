# CFO Tier Boundary Design — 2026-07-24

**Author:** CFO agent (workflow: tier-menu-2026-07-24)
**Status:** Draft for orchestrator merge
**Scope:** Founder segment ladder authoritative; Investor / Advisor / Accelerator ladders documented for parity but no boundary changes.
**Non-goal:** Change dollar amounts. Prices are FROZEN at current plans-v2.ts values; this doc only aligns *feature membership* per tier.

---

## 1. Confirmed tier ladder (Founder — primary)

Prices below are unchanged from `web/src/lib/plans-v2.ts` (source of truth). We formalise the "one headline unlock per boundary" rule so the upgrade psychology matches the growth phase.

| Rank | Plan ID              | Label       | Price (AUD/mo) | Target growth phase                 | Headline unlock at THIS tier                 |
|------|----------------------|-------------|----------------|-------------------------------------|----------------------------------------------|
| 0    | `founder_free`       | Free        | 0 (hidden)     | Phase 0 — Idea (grandfathered only) | SVI limited score                            |
| 1    | `founder_starter`    | Starter     | 29             | Phase 1–2 — Validate → MVP          | Full SVI + evidence uploads + investor links |
| 2    | `founder_growth`     | Growth ★    | 99             | Phase 3–5 — Fundraise pre-seed→seed | Cap-table + Term Sheet AI + Data-room read   |
| 3    | `founder_scale`      | Scale       | 299            | Phase 6–8 — Series A → post-raise   | ESOP + Blockchain sync + Data-room write     |
| 4    | `founder_enterprise` | Enterprise  | custom         | Phase 9–12 — Multi-entity / exit    | SSO + API + Multi-entity + SLA               |

★ = `most_popular` (preserved from plans-v2).

### One-feature-per-boundary rule

Every jump crosses ONE headline gate the founder can *feel* immediately. All other unlocks are supporting members of that boundary's theme:

| Boundary        | Headline unlock (the "aha")   | Supporting unlocks (same theme)                                                        |
|-----------------|-------------------------------|----------------------------------------------------------------------------------------|
| Free → Starter  | **Full SVI 13-criteria score**| `svi.run`, `evidence.upload`, `report.basic`, `investor_links`                         |
| Starter → Growth| **Cap-table + Term Sheet AI** | `cap_table.read`, `cap_table.write`, `data_room.read`, `data_room.access`, `term_sheet.ai`, `term_sheet_ai`, `investor_links.premium`, `profile.multi`, `pdf_branding`, `equity_offer.request`, `report.premium` |
| Growth → Scale  | **ESOP + On-chain sync**      | `esop.manage`, `blockchain.sync`, `data_room.write`, `advisor_portal`, `white_label`   |
| Scale → Enterprise | **SSO + Read/Write API**   | `sso`, `api`, `api.access`, `multi_entity`, `sla`                                      |

*Rationale:* founders don't buy features, they buy the next problem being solved. At Starter they need proof of value (SVI). At Growth they need to raise (cap-table + term sheet). At Scale they need to close/operate (ESOP + on-chain). At Enterprise they need to comply (SSO + audit).

---

## 2. Investor / Advisor / Accelerator ladders (documented, unchanged)

Prices and features FROZEN. Headline unlocks confirmed:

### Investor

| Plan ID              | Price (AUD/mo) | Target                | Headline unlock                     |
|----------------------|----------------|-----------------------|-------------------------------------|
| `investor_angel`     | 79 ★           | Solo angel            | Watchlist + deal flow feed          |
| `investor_advisor`   | 149            | Syndicate lead        | Advisor equity calc + portfolio (partial) |
| `investor_vc_sm`     | 349            | Small VC (5 seats)    | Full portfolio + API read + diligence pack |
| `investor_vc_ent`    | custom         | Institutional         | LP export + multi-fund + SSO        |

### Accelerator

| Plan ID                   | Price (AUD/mo) | Target       | Headline unlock                     |
|---------------------------|----------------|--------------|-------------------------------------|
| `accelerator_starter`     | 500            | Small cohort | Cohort view + stats                 |
| `accelerator_growth`      | 1500 ★         | Full program | Cohort manage + LP report           |
| `accelerator_enterprise`  | 3500           | Multi-cohort | White-label + API                   |

### Admin-only (invisible in marketing)

| Plan ID          | Purpose                                                             |
|------------------|---------------------------------------------------------------------|
| `reseller_admin` | Ops-assigned; grants `reseller.*` feature bundle. NOT in catalogue. |

---

## 3. Canonical tier metadata (implemented in code)

The canonical shape lives at `web/src/lib/entitlements/tier-ladder.ts` and is the ONLY source pricing-page, visibility-matrix, and upgrade nudges may consume. Shape:

```ts
export interface TierLadderEntry {
  id: PlanId;               // 'founder_free' | ...
  segment: Segment;         // 'founder' | 'investor' | 'advisor' | 'accelerator'
  label: string;            // 'Free' | 'Starter' | ...
  rank: number;             // strictly increasing within segment
  monthlyAudBand: [number, number] | 'custom' | 'free';
  targetPhaseRange: [number, number]; // 0..12 from startup-growth-phases.ts
  headlineUnlock: string;   // one-line human-readable
  supportingUnlocks: readonly Feature[];
  hiddenFromPublic: boolean;
}
```

Rules enforced by `tier-ladder.test.ts`:
1. `rank` is strictly increasing within each segment (no duplicates).
2. Every SKU in `plans-v2.ts` PLUS `reseller_admin` appears exactly once.
3. `supportingUnlocks` for tier N is a SUPERSET of tier N-1 (monotonic within a segment).
4. Every `Feature` referenced by `feature-gates.manifest.ts` OR by `LEGACY_FEATURE_FALLBACK` appears in AT LEAST ONE tier's `supportingUnlocks` — no orphan features, no gate that no plan can satisfy.
5. `headlineUnlock` strings are unique across the ladder (one boundary = one aha).

---

## 4. Upgrade psychology — how the UI expresses this

Aligned with the workflow's "hide, do not lock" rule from the orchestrator prompt:

* **Absent from nav** when the user's tier < item's `minPlan`. They never see the locked lock icon in the sidebar.
* **"Recommended next step" tile** on the dashboard surfaces the *single* headline unlock for the tier immediately above their current one, filtered to items in their current growth phase. Copy pattern:
  > *"Ready to raise? Growth tier unlocks Cap-table + Term Sheet AI — everything you need to send a term sheet by Friday. Upgrade from A$29 → A$99/mo."*
* **Server-side redirect** on any URL the user cannot see: `/pricing?feature=<slug>&from=<path>` — preserves upgrade attribution.
* **Add-on lane preserved**: `share_management` still routes to `/workspace/billing?openAddon=share_management` (does NOT force a full tier bump).

---

## 5. Pricing-page (`web/src/app/pricing/page.tsx`) alignment

**Do not touch prices.** Only the comparison-table feature badges. Two changes:

1. Read tier metadata from `tier-ladder.ts` instead of hard-coding a matrix inside the page module.
2. Render each tier's `headlineUnlock` in a highlighted band above the `supportingUnlocks` list — so the "one big reason" reads first.

The current `PLANS_V2[i].features` marketing bullets are RETAINED verbatim (they're copy, not entitlements). The comparison table below the SKU cards is the surface that must match the ladder.

---

## 6. Acceptance criteria

1. `web/src/lib/entitlements/tier-ladder.ts` exports `FOUNDER_LADDER`, `INVESTOR_LADDER`, `ADVISOR_LADDER`, `ACCELERATOR_LADDER`, and `TIER_LADDER_BY_ID` (Record<PlanId, TierLadderEntry>).
2. `tier-ladder.test.ts` proves all five rules above; the "no orphan features" assertion imports both `FEATURE_GATES` from `feature-gates.manifest.ts` AND every string key in `LEGACY_FEATURE_FALLBACK`, then diff-checks against the union of `supportingUnlocks`.
3. `web/src/app/pricing/page.tsx` reads headline unlocks from `tier-ladder.ts`; no hard-coded feature bullets remain in the comparison table.
4. Visibility matrix (04-cto workflow output) and upgrade nudge (mega-batch) both `import { TIER_LADDER_BY_ID } from 'entitlements/tier-ladder'` — single source.
5. No dollar amount in `plans-v2.ts`, `plans.csv`, `plans.generated.ts`, or the Supabase `plans` table changes as part of this workflow.

---

## 7. Risks + guardrails

* **Do NOT change dollar amounts.** All price changes require explicit founder sign-off in a separate ticket.
* **`reseller_admin` stays invisible to the catalogue.** Must be in `TIER_LADDER_BY_ID` (so gates resolve) but NOT in any `*_LADDER` array (so it never renders).
* **Legacy plan IDs** (`free`, `founding50`, `growth`, `growth_annual`) resolve through `PLAN_ID_TO_TIER` — the ladder is keyed on canonical v2 IDs. The test suite must exercise the legacy-alias path.
* **Dual-key features** (`term_sheet.ai` + `term_sheet_ai`, `api` + `api.access`) — both spellings must appear in `supportingUnlocks` for the tier that gates them, or the orphan-check will fire.
* **12-phase gap**: `targetPhaseRange` uses the 0..12 taxonomy from `startup-growth-phases.ts`, but nav-groups still only encode 0..4. That mismatch is a CTO-workflow concern (04); this doc DOES NOT try to fix nav-groups.
