# G30 — legacy SVI re-analysis containment

## Reason and behavior

The existing `/api/agent/analyze` accepted anonymous business slug/field requests, called a model and replaced saved report fields without creator scope, a quote or immutable research history. Connecting the new detail-research feature to that route would defeat the new ownership and billing design and could invalidate a sealed report. This phase suspends that old execution path while retaining all saved report reading.

Candidate `1a68b9a66dd6840fad5d3eb15cd48b942087a606` returns deterministic private/no-store503 `research_not_enabled`, without reading the request body or importing model/storage/billing code. The two UI callers retain short, complete and missing saved answers, all16 question anchors and return navigation; bulk/retry requests are removed. EN/VI copy explains that new research is unavailable. The UI follows existing light tokens; ui-ux-pro-max was applied by the implementation agent.

Four focused mocked-route/SSR checks passed. Full production build and app rollout evidence follows below. The code does not implement market research, new credits or automatic score updates.

## Rollback-persistent public protection

`scripts/svi-research-containment.py` installs only a scoped SVI nginx location for the legacy endpoint, including the trailing-slash form. It takes the shared deployment lock, checks exact active/warm identities, stages nginx validation and preserves both proxy destinations and the static union. A private receipt stores the prior configuration; failed acceptance restores it. Application promotion/rollback preserves this public rule.

The first public probe used Python urllib, which Cloudflare rejected with1010; the script restored the prior nginx configuration. The corrected probe uses curl, retries briefly for nginx worker reload and can reconcile only an exact restored prepared receipt. The subsequent application succeeded: both malformed-JSON probes returned503/private-no-store,81 reports were unchanged, active app traffic stayed4209 and public health remained good. Malformed payloads cannot trigger the old analysis handler even if containment is absent. No model call or credit transaction occurred.

The edge rule protects public traffic, not direct access to retained legacy origin ports. The candidate app also disables its own route. Legacy retained artifacts stay unchanged; do not claim their direct endpoints are fixed. Removing the edge rule requires an explicit future rollout of a fully authorized research flow.

The first app prebuild was refused before artifact creation because the helper's candidate port range ended at4209. The reviewed correction extends that CLI range by one port to4210. Memory/CPU/disk pressure admission, bounded build, per-origin limits and legacy origin identity checks remain unchanged; no existing origin is stopped. The sealed monitor is unchanged: its imported helper behavior is identical, and acceptance permits only the existing unit Install stanza and this exact CLI range difference. This is separate from BlockID's six-origin cap, which is not changed.

Static preparation initially refused the newly added location because the previous union validator recognizes only the two original proxy locations. Before any traffic change, the rollout adapter validated an offline copy without the exact reviewed guard, restored that identical guard into the draft, and proved the entire nginx diff changed only the generated static alias block. Six public assets from legacy/current/candidate generations passed. No unrelated location was admitted and the public guard was never removed during this step.

After rollout, the reusable source union helper was updated to recognize only the exact committed guard while preserving it in output. Three focused tests cover byte-preserving rotation, modified/duplicate/extra locations and includes being refused, and the original layout still working. This is an operator tooling change; the live app artifact remains1a68b9a and the sealed monitor remains unchanged.

## Live acceptance —22 September 2026,14:59 UTC

Compiled `1a68b9a66dd6840fad5d3eb15cd48b942087a606`, BUILD `a0zzhKO01NuzSt4_f3hg7`, now serves4210. Full production build/type gate passed in1m43s with1.9 GiB peak memory. Direct-origin and public `/live` and `/vi/live` returned200. Direct candidate legacy POST returned503/private-no-store; public POST also returned503 during the actual rollback4210→4209 and subsequent forward4209→4210. Six static samples passed,81 existing raw reports were unchanged, monitoring stayed active and the new unit is boot-enabled. Non-SVI nginx/BlockID robots evidence remained identical. No customer credits or model calls were used.

Warm4209 retains71bd532; older origins remain retained. Logs: `/tmp/svi-g30-containment-{build-final,launch,static-final,promote,rollback,rollback-guard,forward,finish}.log`. The initial refused prebuild/static attempts and restored edge probe attempt remain logged separately; none is counted as a successful rollout.

## Next required work

Creator-bound question intent and wallet mapping; account-wide lifecycle; independently sourced market discovery and semantic acceptance; then exact quote/consent/reservation/durable job/publication/capture. BlockID supplied-URL collection currently does not perform market discovery, and synthesis success alone does not establish verified evidence. Keep these gates visible in the unified plan. No new paid activation or G30 completion is claimed.
