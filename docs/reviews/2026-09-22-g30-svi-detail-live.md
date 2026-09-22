# G30 SVI live page and saved-detail phase — live22 September2026

Compiled `919f911e6857cf1c47b8d419ebe72383641e413e`, BUILD `XCqud5eFqYuhgzp3WFFAh`, origin4207, immutable release under `/data/startupvalueindex-releases/919f911e6857cf1c47b8d419ebe72383641e413e`. Unit `svi-release-919f911e6857cf1c47b8d419ebe72383641e413e.service` enabled at boot. Warm4206 retains60940cd, including the `/live` HTTP500 fix. Earlier4205/4204/4203/4202/4002 preserved; no retirement in this release.

## Delivered

- Null daily/weekly BSI history no longer calls `toFixed` on null. Unknown displays unavailable instead of zero; padded trend history is not drawn as observed growth. Initial fix60940cd had already been deployed to4206.
- Public CDN email obfuscation caused React418 while identical origin HTML had no pageerror. Restoring only the email/link in intercepted public HTML also removed the error. Fixed support markup is protected with documented Cloudflare email_off comments, containing only static EN/VI labels and the fixed address. No global security/CDN relaxation.
- Live update time uses Australia/Sydney with correct AEST/AEDT, independent of server timezone.
- Twelve company report sections expose collapsed saved analysis in EN/VI, including recorded alternatives/advantages/limitations in Competition. Visible qualification explains legacy source limits; Claims and overview links preserve navigation. Reading uses no AI/credit or score mutation. New research remains explicitly unavailable.
- Full question-specific market research/credit/SVI/valuation implementation is in the [annex](2026-09-22-g30-svi-detail-analysis.md) under the sole G30 plan. This UI does not perform the new research or increase score/valuation.

## Evidence

Normal full Next build and type checking passed in an isolated release. Three missing-history/timezone tests passed;16 focused saved-detail EN/VI SSR assertions and component syntax checks passed. Four synthetic desktop/mobile EN/VI browser cases used existing compiled CSS: keyboard Enter/Space,50px target, no overflow, valid localized Claims/overview links, no requests/forms or pageerrors. That fixture does not simulate full Next hydration.

Actual public Chromium acceptance on `/live`1440px, `/live`375px and `/vi/live`375px: HTTP200, white background, no overflow, missing-history explanation, mailto support intact, Sydney timezone, no email obfuscation wrapper and zero pageerrors. Mobile navigation opened and closed. Evidence `/tmp/svi-hydration-browser-final.json` and screenshots `/tmp/output/playwright/svi-live-fixed-*`; synthetic saved-detail evidence `/tmp/svi-detail-browser-evidence.json`. Actual company report pages for real customers were not used as synthetic fixtures; broad authenticated journey review is still deferred.

Actual promotion4206→4207, rollback4207→4206 and forward4206→4207 succeeded. Six old/current/new static asset samples remained intact. Shared raw report reader exact hash retained, no Server Actions introduced,81 pre-existing raw report files hash-identical before/after. Monitor active, candidate boot-enabled. Non-SVI nginx scope and BlockID canonical robots unchanged. Logs `/tmp/svi-g30-hydration-{build,launch,static,promote,rollback,forward,finish}.log`; private rollout receipt records exact identity/proofs.

No admission POST, paid inference or customer credit transaction during release. Reviewed measurement/artifact directory settings remain absent. New SVI measurement admission, ownership/lifecycle integration, calibrated profiles, source-qualified research and paid RE-ANALYZE remain separate unfinished gates. G30 is in progress, not sale-readiness sign-off.
