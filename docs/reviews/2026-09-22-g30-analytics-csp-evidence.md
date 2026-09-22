# G30 pricing attribution and homepage CSP evidence

Source-only follow-up to the Evaluator default pricing change. No deployment or external account configuration was changed.

## Implemented

`evaluator_pricing_viewed.via` now distinguishes `default`, `deep_link` and `tab`. The default Evaluator landing is no longer mislabeled as a deep link. During initial URL hydration, an explicit Founder/Programs request does not emit a misleading Evaluator view from the temporary default render. Existing event name and tab values remain compatible; `default` is an additive value for downstream reporting.

## Browser findings

A fresh isolated Chromium visit to the public homepage returned HTTP 200 and reproduced the two inline script CSP violations from the earlier browser log:

| Exact SHA-256 CSP hash | Bytes | Observed script purpose |
| --- | ---: | --- |
| `sha256-VCrOjv7h5SOfH2PqfdfiHaZPB7uV+SdgfWUz0zpxF9o=` | 128 | Pushes the configured container ID into `google_tags_first_party`. |
| `sha256-TZ8iak8EOX/gjO/QgcZyFyLgVJCaL6G4LRRxc8LCeX8=` | 335 | Sets a Google developer ID and injects a same-origin `/2msc/` tag loader. |

These scripts appeared ahead of the application's consent-default script in browser HTML and were absent from the curl HTML/prerender snapshot. This is evidence consistent with a Google tag gateway injection, **not verified account configuration**. The Google [Site Kit tag implementation](https://github.com/google/site-kit-wp/blob/develop/includes/Core/Tags/GTag.php) corroborates the `google_tags_first_party` gateway pattern; it does not establish which service injected these particular scripts.

The same browser observation confirmed React hydration on interactive DOM elements, a visible analytics-consent control, a callable `gtag`, a dataLayer array, and the application's default `analytics_storage: denied` command. Application bootstrap/Flight, theme, consent and GA configuration script hashes matched the response policy. Thus the two reported blocks were not evidence of a broken Next hydration bootstrap.

CSP remains unchanged. Whitelisting these additional scripts would permit another tag-loader path before the application's default consent command. No `unsafe-inline`, broad nonce exception or sitewide dynamic rendering was introduced.

## Validation and limits

73 focused tests across pricing attribution, the analytics event contract, inline script hashes and prerender script hashes passed with private/no-cache execution. `git diff --check` passed. The browser run intentionally aborted analytics collection endpoints, did not click consent, and did not submit a report; it establishes initialization/consent and hydration observations, **not GA4 delivery, reporting accuracy or tag deduplication**.

Private evidence artifacts were recorded outside Git under `/tmp/g30-csp-browser-evidence.json`, `/tmp/g30-csp-hydration.log` and `/tmp/g30-analytics-csp-tests.log`. Script bodies and environment credentials are not added to this report.

## Remaining account-level checks

The release owner reports Cloudflare's official gateway configuration GET returned HTTP 403/code 10000 with the available token, and GA4 Admin read-only inspection returned `api_disabled`. Gateway ownership/settings and the configured GTM container contents remain unverified. Public HTML contains one unique GA measurement ID and a configured GTM container, which alone does not prove whether they send duplicate events.

When working account access is available, inspect the gateway/container configuration, establish a single intended consent-aware loading path, then verify pre-consent behavior and post-consent delivery/deduplication. Do not remove CSP restrictions merely to silence these two gateway-associated violations. These external checks remain open and are not claimed complete by this source change.
