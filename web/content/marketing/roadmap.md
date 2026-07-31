# Platform Roadmap

BlockID is a straight line from founder idea to exit. Eight stages, one workspace, one audit trail. No hype, no lock-in, no black boxes — every score, valuation, cap-table move and disclaimer is derived from data you can inspect and re-run.

We ship in public. Every release is tagged, every task ID lives in the changelog, and the "current milestone" panel above pulls live from the deployed build. If a phase is marked live, you can use it today. If it's marked building, it is being written this quarter.

## The eight platform stages

1. **Founder Vision** — Capture the idea, the segment, and the founder. SVI baseline score, evidence vault, shareable link.
2. **Valuation** — Multi-method valuation (DCF, Berkus, Scorecard, comparables) with AU market benchmarks and confidence bands.
3. **Equity Structure** — Founder splits, vesting terms, share classes, and reverse-vesting scaffolds — all export-ready for legal review.
4. **ESOP** — Employee option pool sizing, grant tracking, vesting schedules, and s83A ATO election workflow.
5. **Cap Table** — Real-time cap table with SAFE / convertible-note support, waterfall modelling, and diff-on-every-change history.
6. **Tokenisation** — Optional on-chain mirror of the cap table (compliance-gated, wholesale-only under s708). Display-only until legal review passes.
7. **Dividend Distribution** — Distribution schedules, franking credits, and on-chain dividend rails for tokenised registers.
8. **Exit** — Data-room, secondary market intros, and acquisition / IPO checklist packs.

## Shipped (v3.0 — 2026-07-30 → 2026-07-31)

### Phase 1 — Message + SSO + Paywall MVP

- **HeroV3 + EmotionalBand** locked v3 messaging ("One Business. One Trusted Identity.") behind `NEXT_PUBLIC_UPGRADE_V3`, with SSO-aware CTA via `readSignedInHint()` cookie helper.
- **Paywall lifecycle** — migration `0270_report_orders` (9-state), `POST /api/reports/checkout` (Path A A$5.50 inc-GST) + `POST /api/reports/redeem` (Path B 200 credits), and `<ReportPaywallGate/>` confirm-before-charge modal.
- **V3 SKU catalogue** (`sku_trust_report_5aud` + 6 tier SKUs) and nav v3 schema with `hideWhenLocked` / `persona` / `journeyGroup` fields plus `decideVisibility` helper.

### Stage 3 — Report backbone

- **Stripe webhook** branch for `report_order` scope with reconciliation INSERT fallback.
- **Report queue** — migration `0272_report_generation_queue` + `report-order-worker` + cron `/api/cron/report-order-drain` (every 2 min).
- **Solution pages + SEO** — 4 pages (`/solutions/{founder,vn-sme,investor,accelerator}`) + `/business-id` explainer, sitemap expansion, robots update, legacy `/for/*` → `/solutions/*` 301 redirects.
- **Navigation UX** — PersonaRail (6 personas) + JourneySidebar (8 journeyGroups) + TierGate + UpgradeChip + `tierCovers` helper.

### Stage 4 — Verified Business Identity surface

- **/id/[slug] public profile** — SEO-indexable per D3, migration `0273`, PII whitelist, JSON-LD, and `/embed/badge` SVG widget for external sites.
- **Consent domain** — `0250_consents` + `consent_state_events` + `0251_share_packages` + `0252_revocations` (BCR-004) with `enforceConsent` middleware guarding read paths.

### Phase 2 — Verification ladder

- **ABR adapter** with JSONP + Zod normalisation and 5-level verification engine (`sub-F2` + `sub-F3`), migration `0202_business_profile` VIEW, `POST /api/verification/abr` endpoint.

### Phase 3 — Evidence pipeline

- **Evidence versioning + extraction** — migrations `0210_evidence` + `0211_evidence_versions` + `0212_evidence_extractions`, hash-verify pipeline, state-machine transitions.

### Phase 4 — AI orchestration

- **Prompt registry + Zod contracts** — migrations `0230_prompt_versions` + `0231_ai_runs`, canonical Zod output contracts, prompt-registry canary→prod swap, `callStructured` wrapper for typed LLM outputs.

### Phase 5 — Programme + marketplace + partner API

- **Cohorts + marketplace** — migrations `0290_programme_cohorts` + `0291_marketplace_opportunities` + `0292_oauth2_partners`.
- **Partner API** — `verifyPartnerBearer` + `GET /api/v1/id/[slug]` OAuth2-callable JSON.

### Phase 6 — Unicorn framework

- **S0-S5 stage model** — migration `0280_unicorn_stages` + `framework.ts` + `goals.ts` decomposition + `<UnicornPathDashboard/>` server component + 2 nightly crons.

## In progress

### Agent K — Reseller promotion codes (IFV / DVL prefixes)

- K1 landed — `reseller_promotion_codes` extended for v3.
- K2 landed — IFV + DVL seed script + provisioning wired.
- K3 landed — `resolvePromoCode` runtime helper + 8-case test.

### Agent L — Reseller startup roster dashboard

- L1 landed — `reseller_startup_roster` view (migration `0295`).
- L2 landed — `readResellerRoster` helper + tests.
- L3 pending — `/reseller/roster` page surface + notes/activity table (`0296`).

### Agent M — `?ref=CODE` attribution wiring

- M1 landed — `?ref=` deep-link capture + first-touch cookie.
- M2 landed — signup promo-code input + `POST /api/reseller/validate-promo` endpoint.
- M3 pending — Stripe checkout attribution wiring + reconciliation ledger.

## Next up

- **Full `@supabase/ssr` middleware refresh** (§8.9 stage 2 of the master plan).
- **Route groups reorganisation** — physical `(marketing)` / `(app)` / `(persona)/*` split.
- **ClamAV daemon** integration for evidence malware scan on upload.
- **Prompt-eval golden fixtures** — canonical outputs pinned per prompt version.
- **Full `/vi/*` mirror** — D4 deferred beyond Phase 1 MVP.
- **VC issuer keypair custody** — hardware-backed signing for verifiable credentials.
- **Migration `0271_grandfather_a149`** — blocked on CFO sign-off for pricing carry-over.
- **`scripts/stripe/sync-plans.mjs` live provisioning** — blocked on CFO Stripe key provisioning.

## Deferred

- **ISO 27001 scoping** — Year-2 initiative per §9.10; SOC 2 Type I remains the near-term certification path.
- **Continuous VN market localisation** — beyond core `/vi` UI; deferred until Vietnamese founder cohort clears MRR threshold.

## Master plan reference

Full v3 Master Upgrade Plan lives at `/home/dovanlong/.claude/plans/h-y-k-t-h-p-n-ng-hazy-sutton.md` — every phase, migration, and gate captured there is the source of truth this roadmap reflects.

## What we won't ship

- We won't ship a general-advice financial recommender. All numeric outputs are decision-support only.
- We won't ship blockchain-sync for a cap table without a passed legal review and s708 wholesale test.
- We won't ship dark patterns. Cancel is the same distance from your account page as upgrade.

Auschain PTY LTD — ACN 659 615 111. Sydney NSW.
