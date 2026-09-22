# GA4 consent command correction — 2026-09-22

Source-only follow-up based on `99ae220af`. A fresh isolated Chromium context loaded the BlockID homepage, accepted the visible consent banner, and navigated to pricing. All collection requests were intercepted and aborted; tag loaders were allowed. No analytics delivery, account write or deployment occurred.

## Concrete defect and correction

The banner persisted acceptance and pushed a plain array into dataLayer. Google did not apply that command: later request intents still carried `gcs=G100`. In the same isolated page, invoking the existing `window.gtag` consent update produced a subsequent `user_engagement` intent carrying `G111`. The distinction is the command envelope: the installed bootstrap queues an Arguments object, whereas the helper queued an Array.

The helper now uses the installed `window.gtag` for both grant and revocation. Its early-bootstrap fallback queues an actual Arguments object. Storage keys, consent values and CSP are unchanged. [Google's consent implementation guide](https://developers.google.com/tag-platform/security/guides/consent) documents the bootstrap and update commands used here.

23 focused consent tests passed, including installed-bootstrap dispatch for grant/revoke and exact fallback command-envelope checks. Diff whitespace checks passed. Browser confirmation used the equivalent existing gtag command; the new bundle still needs release-time verification.

## Request-emission evidence and limits

- Both application loaders (`gtag.js`, `gtm.js`) returned200 despite the two previously identified inline gateway-associated CSP violations.
- Every observed GA event targeted the configured shared measurement ID and carried `dl` on `blockid.au`; the application does emit BlockID-host events.
- On the fresh homepage, one initial page-view intent was observed on each of two collection transports (`www.google-analytics.com` and `www.google.com`), both denied-consent G100. Aborting requests can influence retries/fallbacks; this is not proof of duplicate ingestion.
- A `/pricing` page-view intent appeared after the initial3.5-second navigation observation window. The shorter window's zero count is not evidence of lost navigation views. Source also has config-based initial page views and a PageViewTracker; no page-view policy was changed in this patch.
- Pre-consent request intents are already possible with the current tag configuration. The banner claim that nothing is tracked until agreement requires a separate decision on basic versus advanced consent behavior; this patch fixes command dispatch, not that product/policy mismatch.
- Collection remained aborted even during the diagnostic consent update. No assertion is made about GA4 ingestion, deduplication, attribution totals or account-side filtering. Existing Cloudflare403 and GA4 Admin API-disabled gates remain unresolved.

Sanitized private evidence: `/tmp/g30-ga4-intents-evidence.json` and `/tmp/g30-ga4-consent-confirmation.json`. Browser contexts were closed; their consent clicks were ephemeral.
