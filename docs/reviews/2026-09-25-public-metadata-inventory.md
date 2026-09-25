# Public version, team and report metadata — 25 September 2026

Reviewed 01:42–01:45 UTC. Public GETs and source inspection only; no deployment,
production writes, inference, emails or runtime-content regeneration.

| Surface | Proven source / definition | Observed state and disposition |
| --- | --- | --- |
| `/api/version` | Bundled `web/package.json` | Public GET returned `3.33.0`. Existing `version` remains package version for consumer compatibility; additive explicit package, deployment, built-source, deployment-time and report-generator fields distinguish their meanings. |
| `/api/status` | Serving manifest and health snapshots | Public GET returned `v3.33.3`, source `03356f9cb9f740a8d9a2ac93f941e40dfe78621b`, `ok:true`. This is a timestamped observation, not proof of every acceptance gate. |
| `/version` | Serving `.deploy-manifest.json` | Manifest recorded deployment at `2026-09-25T01:34:50Z`. Corrected source display to prefer `build_sha` over promotion `git_sha`, matching status semantics. Added package/pipeline/code-default prompt definitions. Historical curated list is now labelled selected history and links to current notes. |
| Report pipeline | `src/lib/report-pipeline/version.ts` | `pipeline-v2.1-s-r10-citation-integrity`; code-default prompt version `2.4.1`. Persisted prompt registry overrides and individual stored report provenance remain separate. No version bump or regeneration was invented. |
| First-analysis report | `src/lib/analyses/first-analysis/types.ts` | Schema version `1`; distinct from full report pipeline and package semver. |
| Investor Pack PDF | `src/lib/pdf/investor-pack.tsx` | Template named Investor Pack v2; footer imports `content/reports/version.json` at build time. This is a release label, not per-report source evidence. No PDF template changes in this task. |
| `/changelog` | `web/CHANGELOG.md` | Previously ended at `3.32.0`; added current `3.33.3` deployment-family notes grounded in shipped source and maintained closed-gate limitations. |
| `/team`, `/team/[agent]` | Published `team-roster.json` and detail JSON; generator `scripts/docs/regenerate-team-page.mjs` | Operational roster has 11 entries including Customer Success; report prompt roles separately have CEO plus 10 C-level domains. These sets are not interchangeable employee counts. Stored latest activity includes July 24 while pages claimed live last-30-day shipping. Corrected labels to stored collection-window activity, explicitly unknown refresh time and records not verified deployments. No counts, names or runtime files rewritten. |
| `/status` and operational logs | Status API plus independent runtime snapshots/logs | Separate health, delivery and source-quality meanings retained. This task does not rewrite operational logs or claim G31/G32/G33 completion. |

The team generator has no stored generation timestamp. File mtime and latest
activity date do not establish the collection timestamp, so freshness cannot
be honestly reconstructed from these fields. The existing role snapshot was
not regenerated and no new people or role counts were invented.

Validation: deployment reader tests cover cwd precedence, malformed data,
allowlisted fields and build-vs-promotion provenance; API test preserves legacy
package semantics while exposing explicit release/pipeline identifiers. Page
checks cover version definitions and removal of misleading live-team claims.
Four focused suites passed (seven tests); focused ESLint and diff checks passed. Production
serves the earlier bundle until the owner's deployment; changes above are
source changes, not a claim that the new metadata is already live.
