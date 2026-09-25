# Platform statistics integrity — 25 September 2026

Source changes, not a deployment receipt. The previous public endpoint invented
500 monthly visitors, converted SVI scores to money with `score * 10,000`, returned
zero on missing/query-error data, and replaced filtered snapshot counts with
unfiltered live queries. It also returned the current request time as if every
number had just been measured.

The route now preserves existing metric keys with `null` for unavailable values,
adds per-metric definitions/source dates, and exposes registered-account and raw
report-record counts from the daily snapshot. It makes no database queries.
Articles count actual Markdown files, with no fallback31. No valuation aggregate,
visitor count, tool count, evidence count or mixed-method average is invented.
`ok` describes a valid response; `dataStatus: partial` describes coverage.

The snapshot reducer rejects future/stale dates, malformed/partial counts,
failed/capped account scans and unmeasured empty subscription maps. Home-stat
property names remain compatible but represent analysis rows and evaluator
accounts, not distinct companies/organisations. Historical source timestamps
remain distinct and the caption uses the oldest contributing source. The cache
expires when traction becomes stale even if files do not change. Missing register
inventory counts cannot be substituted with newly inserted rows or silently zero.

Repository consumer audit: platform-stats is linked by admin listings and named
by admin traction; no typed production consumer of its numeric values was found.
Home-stats currently has no production caller under web/src. Retained keys are
nullable, so external directory integrations must display unavailable rather than
coercing null to zero. Admin traction continues to display its raw snapshot.

## Refreshed aggregate evidence

Reviewed `buildTractionSnapshot` and persistence modules, then refreshed only the
local snapshot/history with Stripe disabled. The temporary runner enforced GET/
HEAD against the configured database REST origin, with 15-second request limits.
18 read-only database requests; zero database writes, inference, emails or provider
calls. No account identifiers or customer content were printed.

Snapshot generated **2026-09-25T01:46:48.140Z**, no warnings:

| Metric | Count | Definition |
|---|---:|---|
| Registered accounts | 66 | Known QA/seeded/erased email patterns excluded |
| Founder accounts | 61 | Non-evaluator accounts in that filtered set |
| Evaluator accounts | 5 | Plan/account-type buckets; not distinct organisations |
| Excluded accounts | 259 | Matching account exclusion patterns |
| SVI analysis rows | 183 | Raw table rows; QA/reruns may be included |
| Other analysis rows | 354 | Separate raw analyses table; do not add as unique analyses |
| Paid guest-analysis rows | 1 | Paid/analyzing/delivered status rows |
| Report order rows | 0 | PAID/GENERATING/READY/SHARED states |
| Shared snapshot rows | 2 | Non-null report share token; not unique companies |
| Report view rows | 0 | Raw tbr_views count; not unique people |
| Active evaluator subscription rows | 0 | Account-filtered active rows; not receipt-confirmed payments |

Anonymous HTTP checks of the public endpoints failed at the edge; these are
current aggregate snapshot observations, not a claim the old live endpoint has
already changed. Immutable serving releases receive the refreshed file through
normal release handling. Runtime snapshot/history are left for root to include
in the intended release, separately from the bounded source commit.

Validation: six focused Vitest files, 44 tests passed; targeted ESLint passed; typecheck result reported
separately to the coordinating agent. No migrations, deployment or scoring changes.
