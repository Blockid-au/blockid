# Second review and live deployment — 25 September 2026

Both sites independently verified at 01:40 UTC. This receipt supersedes the
not-deployed status of this review's three fixes, not the remaining product
acceptance work in the [full-plan follow-up](2026-09-24-full-plan-followup.md).

## Reproduced bugs fixed

- SVI Markdown IC memo exports lost saved source references/catalog and the
  explicit valuation-unavailable explanation. The renderer now uses the shared
  saved findings projection, with bilingual references and zero/unavailable
  distinction. Commit `dcfb670`.
- Linked CFO scenarios rejected valid named evidence revisions when their
  separate content hash differed. Explicit entity, revision and hash bindings
  now govern linked inputs. Currency checks and projection-only hash-as-revision
  enforcement remain. BlockID `03356f9cb`, SVI `a7e1661`; mirrored source matches.
- Post-login `logged_in` and `claimed` flags were concatenated after URL
  fragments, so destination query parameters were missing or stale. Shared
  same-origin query handling preserves fragments and replaces duplicates.
  BlockID `f19301494`.

## Serving identities

| Site | Source SHA | Build | Active / warm |
| --- | --- | --- | --- |
| BlockID | `03356f9cb9f740a8d9a2ac93f941e40dfe78621b` | `aEdcIzg169JcYZnE9ojiw` | 4145 / 4144 |
| SVI | `a7e1661fd81f6761a2bb8a8b803febe67310de9f` | `H3Di9FKQ2Jzp_Ch6UKgSw` | 4215 / 4214 |

## Validation and operational evidence

Auth: 45 focused tests passed and focused lint clean. CFO: 65 BlockID tests
and five SVI tests passed; source mirror and targeted lint clean. SVI export
review: 16 focused tests and typecheck passed. Root subsequently reran two
export/persistence files (nine passing tests) and SVI typecheck; these overlap
and must not be added to earlier counts.

BlockID canonical accelerated deployment completed: incremental secret scan,
environment, database/Redis, production build including TypeScript, 12 candidate
browser smokes, eight HTTP endpoints/two redirects, runtime identity and public
health. Full unit suite, standalone lint/typecheck and extended browser/link
review were deferred under the existing founder fast-release policy, not passed.
The previous full-suite result belongs to the preceding release. After more
than 60 seconds and independent public/browser checks, mark-good ran under the
shared deployment lock with explicit review-deferred status. The normal
30-minute soak and full product acceptance are not asserted.

To admit the new BlockID candidate, exact old inactive/non-warm origin 4139
was retired using the fingerprinted guarded controller. Reviewed nginx/user-cron
references, active sockets and tracked activity/jobs were absent. Root crontab
inspection was not established; unknown work was explicitly acknowledged, not
claimed quiescent. Active4144 and warm4143 were preserved at retirement. The
source-bound, expiring sixth-origin resource permit retained capacity six.

SVI initially stopped before build because memory pressure exceeded admission.
Once pressure returned below threshold, the prepared build resumed with no
weakened limit. Its capped isolated build succeeded, then candidate HTTP health,
source/dependency/env identity, unchanged store/protected runtime and static
union checks passed before promotion. Active and warm both retain the required
quote-reader capability. Existing report snapshot comparison found zero changed
prior report files. No new report canary, paid inference, email or migration was
performed. No disruptive rollback drill was run.

Independent public checks: BlockID status reports the exact new source; SVI apex
and www health report the exact new build. BlockID sample report and SVI scenario
navigation had no console errors observed. BlockID login retained expected
signed-out Google/FedCM diagnostics; no CSP or React418 reproduced. Both scenario
APIs returned401 for anonymous same-origin requests. No authenticated production
calculation/login/report canary was available, so these are not claimed verified.

Cloudflare: BlockID cache purge succeeded using its separate cache credential.
SVI purge API permission remains unavailable; the deploy's combined purge step
therefore warned. Public SVI returned the correct new build despite this. Earlier
Cloudflare gateway/CSP repair remains in place; no CSP relaxation was introduced.

## Evidence

- `/tmp/review2-blockid-deploy.log`, `/tmp/review2-blockid-mark-good.json`
- `/tmp/review2-retire-plan.json`, `/tmp/review2-retirement.log`
- `/tmp/review2-svi-{build,resume-build,launch,static,promote}.log`
- `/tmp/review2-svi-typecheck.log`, `/tmp/review2-svi-export-tests.log`
- Browser snapshots: `.playwright-cli/page-2026-09-25T01-35-46-923Z.yml`,
  `page-2026-09-25T01-35-57-979Z.yml`, `page-2026-09-25T01-39-37-303Z.yml`.

Full G31/G32/G33 rubric, financial calibration, official valuation/scoring
activation and authenticated product acceptance remain tracked separately.
Successful operational deployment does not certify every application path.
