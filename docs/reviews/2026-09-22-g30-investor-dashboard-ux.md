# G30 U07 — investor desk overview slice

Source base: b3275d1bb. Presentation-only implementation for the investor landing shared by angel/VC personas; existing workspace breadcrumbs, authentication, permissions and loaders remain in place. No production deployment or financial/data changes performed by this task.

The desk now leads with “Analyse a business” and three explicit destinations: evaluations, discovery and investment preferences. The evaluation card lists up to three existing businesses with direct assessment/evidence links, including unscored businesses, instead of displaying only businesses whose score moved. It does not call these rows “latest reports”: the current loader supplies a roster and scores, not final-report lineage.

Report allowance, credits and partial mandate configuration move below the review area into a keyboard-operable native disclosure; exhausted/no allowance opens it automatically. An empty mandate remains visible beside evaluations to make setup actionable. Consent/access details are separately expandable. Navigation actions use secondary styling, light shared surfaces, dark text, visible keyboard focus, wrapping business names and larger targets. Shared CTA focus/size and consent disclosure also improve advisor/accelerator cards; those personas retain their existing block layout.

Used UI/UX Pro Max: prioritize reading hierarchy, 44px targets, focus, native progressive disclosure and reduced motion. Its generated dark palette conflicts with G30/user requirements and was rejected; existing light/navy/Inter tokens remain authoritative. No new theme or dependency.

Validation: 19 focused investor-landing render cases passed, covering all three persona families, empty/partial/full mandates, linked unscored reviews and exhausted allowance disclosure. Scoped ESLint clean; esbuild transpilation/bundling passed. Actual authenticated browser/mobile/contrast checks, latest-final report library, data-cutoff/error-state contracts, EN/VI expansion and full dashboard/page-family redesign remain pending. This slice does not close U07 or sale gates.
