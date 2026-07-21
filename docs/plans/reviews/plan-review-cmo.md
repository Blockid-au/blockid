---
name: plan-review-cmo
role: cmo
verdict: approved_with_notes
ran_at: 2026-07-21
scope: p0.3_advisory
---

## Summary

The reseller marketing surfaces (P2 `?via=` funnel, P5 co-branding, and Track B B5/B6/B7 showcase set) are shipped and on-brief for the wholesale-introducer positioning: Auschain stays seller-of-record, the reseller is credited as introducer, and `/showcase/blockid` is a defensible SEO play built on real dogfood data. Marketing coverage is EN+VI complete for the pill/consent/onboarding path (§C.4), and the public showcase + report library are indexable with sane metadata. Advisory notes below are non-blocking but should be scheduled before we start actively recruiting resellers.

## Findings

- `?via=` capture is wired correctly at `web/src/components/svi/svi-entrance.tsx:223-234` (mirrors the `?ref=` mechanic with 30-day cookie + localStorage, normalised to uppercase alphanumeric). Funnel attribution therefore survives Google auth, onboarding, and Stripe checkout per §C.2 / U.6 — no leakage risk visible from the client capture path.
- Co-branding respects §C.3's "three surfaces only" rule: topbar pill via `ResellerPill` (goal §P5 files list), Stripe metadata on `checkout/route.ts` (`subscription_data.description = "Referred by X"` + invoice `custom_fields`), and the EN/VI email footer helper at `web/src/lib/reseller/email-footer.ts`. Non-customisable elements (BlockID logo, From:, domain) remain untouched — brand containment is intact.
- Wording drift vs plan §C.3: shipped Stripe copy says "Referred by X" / "Brought to you by X" (goal §P5), whereas plan §C.3 point 3 specifies "Introduced by <Reseller>". Same for the topbar pill translations (`reseller.badge.introduced_by`). Minor but visible to every paying customer on their invoice.
- `/showcase/blockid` (`web/src/app/showcase/blockid/page.tsx:37-68`) has clean canonical, OG, Twitter, robots-index, and AU-locale metadata; renders live phase + milestone + agent activity from on-disk artefacts with the correct §284 redaction posture. This is a genuinely differentiated SEO surface — no direct competitor (Vestd, Cake Equity, Global Shares) publishes a live founder-journey mirror.
- `/guide/reports` (`web/src/app/guide/reports/page.tsx:31-65`) is indexable and keyword-targeted at "startup report templates / founder report library / cfo|cto|cmo report template". Download route + GA event are explicitly deferred (goal §B5_report_library note + plan §300); without those we cannot measure template-library ROI or feed the CRO funnel.
- Email footer helper is built but **not yet wired** into `sendWelcomeWithReport` / payment-receipt templates (goal §P5 exit-criteria deferred to P7). Until P7 lands, the "Introduced by X" attribution only reaches the customer via the topbar and invoice — not the welcome/receipt emails that §C.3 point 2 requires.

## Recommendations

- Align invoice/pill wording to plan §C.3 "Introduced by …" (or update plan §C.3 to match "Referred by …") in the P7 tick — pick one canonical verb and propagate to `reseller.email.footer`, `reseller.badge.introduced_by`, Stripe checkout stamps, and the VI translations. Consistency across surfaces is what makes the co-brand feel intentional.
- Land the `/api/guide/reports/[filename]` download route + `gtag` event before the first reseller marketing push, so we can attribute template downloads to `?via=` cohorts and feed the CRO funnel dashboards.
- Add JSON-LD `Organization` + `WebPage` structured data on `/showcase/blockid` and `ItemList` on `/guide/reports` — cheap SERP win given the pages already have canonical URLs and unique metadata.
- Draft one competitor-landscape note in `web/content/reports/` covering Vestd / Cake Equity / Global Shares reseller programmes so the CMO agent has grounding when writing the reseller-recruitment landing page (currently no `/reseller` public marketing route exists).
- Consider a `/reseller` public landing page (separate from the admin `/admin/resellers`) as a P0.4-era ask — right now there is no top-of-funnel page describing the wholesale introducer offer to prospective resellers.

## Next-tick asks

- P7 tick to wire the email-footer helper into welcome + receipt emails and to standardise co-brand wording across pill / invoice / footer.
- Follow-up B5 tick to land the download route + GA event so template-library engagement is measurable.
- Schedule a CMO-agent research pass on competing AU/UK cap-table reseller programmes to seed the `/reseller` recruitment landing copy.
