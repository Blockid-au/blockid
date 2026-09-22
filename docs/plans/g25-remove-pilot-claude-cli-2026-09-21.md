# G25 — Remove the paid pilot + coupon · Anthropic via the Claude CLI · founder-only items resolved by AI

> **Planning authority — 2026-09-22:** [G30 SOURCE OF TRUTH](./SOURCE-OF-TRUTH.md) consolidates the next upgrade, priorities, dependencies and sale gates. **PROPOSED / awaiting founder review; implementation not started.** This document is a historical component plan. Its shipped work is retained; residual work is mapped into G30 §3/§12. Older “continuous”, “defaults ship” or lane-launch instructions do not authorise G30 implementation.

**Opened:** 2026-09-21 — founder (verbatim): "continouos, lưu ý founder-only sử dụng luôn claude cli để xử lý và bỏ luôn coupon và pilot".
**Owner:** Claude session loop — worktree lanes → merge → full `--project unit` + pdf → 12-gate deploy → elevated live-qa + link-check + page sweep → read-only review + ui-ux-pro-max check → fixes → close.
**Tracked in:** `docs/plans/SOURCE-OF-TRUTH.md` § G25 · `ROADMAP.md` row G25.
**Status:** CLOSED 2026-09-21 — live in v3.26.0 (`be1f41cf2`); lanes A/B/C/D shipped; 0437–0440 applied; see SOT § G25.

## 1. Decision (overrides G21 P0-C / P2-C and G23 lane B)
- The **paid Cohort Validation Pilot** (A$1,500 / A$2,500 one-off SKUs, `pilot_orders`, `/pilot`, `/vi/pilot`, pilot delivery kit purchase path) and the **pilot → annual coupon conversion** (`STRIPE_COUPON_PILOT_CREDIT_25/50`, `convert_from_pilot`) are removed. Programs go straight to the sold ladder (Cohort 25 / 100 annual with the card-required trial; Scout / Firm / Program). No other price changes. `pilot_orders` stays as a read-only ledger (0437 comment only; no drops).
- The admin-only comped investor pilot (`/pilot/investor`, G14/G16) leaves the public routes too; `/admin/pilots` remains a ledger of past comps.
- **No Anthropic API key.** `ANTHROPIC_API_KEY` is optional; absent → the tier is skipped silently (`anthropic: not_configured`, `anthropic_path: claude_cli`); the Claude CLI subscription path (`claude-oauth`) is the Anthropic fallback after the DeepInfra-first free chain (order unchanged). The key line is removed from `web/.env` / `web/.env.runtime` at merge (vault backups keep history).
- **Founder-only items are resolved by AI where possible**: demo-startup names checked against ABN Lookup / ASIC / IP Australia (two collisions replaced), the first funding-announcements CSV curated from public sources (33 rows, sourced), `docs/ops/founder-items.md` lists only what truly needs a human (Stripe dashboard, tokens, legal signatures).

## 2. Lanes
### A — Remove pilot + coupon (skills: stripe-saas-billing, ui-ux-pro-max, au-compliance, seo-content-au, playwright-e2e)
Redirect map `/pilot`, `/vi/pilot`, `/pilot/investor` → solutions pages; components, SKUs, checkout branch, webhook conversion, env NAMES, health expected-env lists, seed rows, claims register + never-say guard row, EN/VI catalogues; `/workspace/accelerator/pilot` → `/workspace/accelerator/onboarding` "Cohort onboarding kit" (demo-cohort pre-step, metrics, case-study consent; no purchase/conversion); validation tracker L3 "Written proposals" · L4 "First paying program" · L5 "Renewal or second paying organisation" auto-filled from subscriptions / revenue events; proposal PDF re-based on the Cohort annual plans ("Cohort proposal"); live-qa 31/34/37/41 updated; docs (pricing-truth, pilots retired, validation-tracker, feature inventory); migration `0437_pilot_orders_retired.sql` (comment only).

### B — Anthropic via Claude CLI + founder-only cleanup (skills: debugging-wizard, monitoring-expert) — MERGED
Key optional + `not_configured` state on `/api/status`, `/admin/ai-keys`, docs; three code paths that required the key fixed (`prompt-eval-nightly`, `nightly-clevel-review.mjs`, `deploy-live.sh` gate 1 — would have blocked every deploy once the line is removed); demo names Banksiabyte Compliance / Numbatpay Ledger replace two collisions (legacy slugs resolve); `web/content/external-signals/funding-announcements-2026-09.csv` (33 rows, ABN checksums + HTTP-200 sources) read repo-first; `docs/ops/founder-items.md`.

### C — First two analyses free, e-mail required, submissions + deliveries counted (skills: cro, stripe-saas-billing, supabase-postgres, au-compliance, analytics, playwright-e2e)
Founder 2026-09-21: "cho phép phân tích 2 lần đầu miễn phí, nhưng cần ghi nhận email để gởi report về và ghi nhận vào hệ thống số lượng người submit và nhận report biz". First TWO full business reports per normalised e-mail are free (guest or account), the third onward = the existing A$3 quote-then-pay; e-mail required before the run (consent line = data-principle sentence + unsubscribe), report delivered by e-mail (PDF + secure link) and on-page; abuse guard (≤ 3 / IP hash / day, honeypot, disposable domains) + `FREE_REPORTS_DAILY_CAP` (default 50, queued message); ledger `free_report_grants` (0438, service-role RLS, erasure map); metrics `free_reports {submitted, delivered, unique_emails, today, cap, converted_to_paid}` on `/api/status` + `/admin/funnel` block + funnel events `free_report_submitted/delivered`; live-qa lane 43; `docs/ops/free-reports.md`.

### D — Review before pay: no automatic Stripe redirect (skills: stripe-saas-billing, cro, conversion-optimizer, ui-ux-pro-max, au-compliance, playwright-e2e)
Founder 2026-09-21: "phải click nút pay thì mới chuyển sang stripe page". One `/checkout/review` step (+ VI) for every Stripe hand-off — plan, inclusions, price incl. GST, trial / renewal / cancel terms (ACL wording), data principle, entity — and only the explicit **Pay** / **Add card & start trial** click calls `POST /api/stripe/checkout`; card-required sign-up shows the same review block above the card form; every entry point (pricing, onboarding, upgrade modal, billing, packages, credit packs, Fund/Intake/Index API, gates, e-mails) links to the review; guard test allow-lists the checkout callers; events `checkout_review_viewed` → `checkout_started` on `/admin/funnel`; live-qa 34 asserts no checkout request before the Pay click.

## 3. Acceptance
No `/pilot` hrefs in `src`; 301s live; checkout/webhook have no pilot branch; `/api/health/stripe` no longer expects pilot env names; validation tracker levels re-worded and auto-filled from subscriptions; full unit + pdf green; deploy 12/12 with the key line removed; elevated live-qa green incl. 31/34/37/41; link-check 0; sweep 0; review + ui-ux-pro-max check → fixes; `version.json` v3.25.0; SOT § G25 closed.

## 4. Founder-only
None engineering. Remaining human items only in `docs/ops/founder-items.md`.
