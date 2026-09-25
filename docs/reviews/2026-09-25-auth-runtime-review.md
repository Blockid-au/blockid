# BlockID runtime and login review — 25 September 2026

## Read-only production evidence

Checked the active 4144 origin and public pages around 01:16–01:18 UTC.
No authenticated login, inference, report generation, email, migration, or
production write was performed.

The active origin's append log contained 121 lines in the bounded sample.
Error/warning keyword matches included 57 `[ServerResponse]` tags, eight
`[ai-client]` tags and one unclassified line. These are keyword matches, not
57 failed requests. No recognized Node error code or named exception matched;
no `fetch failed`, `write after end`, `Cannot set headers after they are sent`,
`timeout`, or `aborted` text matched. No user content, identifiers or raw log
lines are retained in this receipt. This small sample does not establish
comprehensive runtime health.

A fresh signed-out Chromium navigation to `/auth/login` reproduced Google's
FedCM empty-account/NetworkError diagnostics and the app's One Tap
`unknown_reason` diagnostic. The Google script also warned about older prompt
notification methods. No CSP or React hydration error was observed. These
provider diagnostics were preserved; a signed-out browser is not evidence
that authenticated Google sign-in succeeds or fails.

A subsequent `/sample-business-report` navigation reported zero console errors
and zero warnings. The prior edge CSP repair remains consistent with this
check; no CSP weakening or provider setting changes were made.

## Reproduced source defect and correction

For a valid return path such as `/workspace?tab=valuation#report`, the login
form previously concatenated `&logged_in=true` after `#report`. The destination
therefore received no `logged_in` query parameter. `withClaimedParam` had the
same defect for the actual rescued-analysis count, and a pre-existing `claimed`
value could mask the new count.

A shared same-origin redirect query helper now sets parameters before the
fragment and replaces stale duplicate values. Google and email/password login
use it for `logged_in`; the existing claim-count helper uses it for `claimed`.
The original destination fragment and unrelated query values remain intact.
The existing same-origin guard applies when flags are set.

Validation: four focused suites passed (45 tests); focused ESLint and diff
whitespace checks passed. Coverage includes anchored destinations, a question
mark inside the fragment, unrelated query values, stale duplicates, off-origin
rejection, Google fallback rendering and existing login-page behavior. Tests
exercise deterministic redirect handling without live credentials. Deployment
and authenticated end-to-end verification remain with the release owner.
