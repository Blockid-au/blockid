# Uncapped SVI: additive report reader

Follow-up to `f02db74` and `2026-09-22-uncapped-svi-methodology.md`. This commit supersedes that document's “reader not implemented” status only. Calibration, source admission producer and activation/ranking gates remain outstanding.

## Implemented

- Completed RunState now accepts optional `longitudinal_svi: ReportIndexInput`. Legacy JSON remains valid; no migration or report rewrite.
- `readReportIndex` binds method, business slug and immutable report run ID. It requires explicit profile, metric currency/period basis and reviewed measurement admission with evidence ID, SHA256, retained source snapshot ID, fact ID, effective date, admission/recorded time and policy/reviewer identity. It rejects stale/cross-business report binding, mismatched units/period/currency/hash/date and future admissions. Monetary normalization basis participates in profile identity so changed currencies cannot masquerade as growth.
- Inputs retain exact asOf/knowledgeCutoff; reads do not use today's time. The scoring engine computes real numeric uncapped values for valid typed fixtures; untyped prose or a legacy numeric Investor Score cannot qualify.
- CompanyOverview consumes this adapter via a separate EN/VI native disclosure below the existing headline. Admitted inputs show an explicitly experimental total, method profile, coverage and 13 criterion weights, current contributions and source snapshot references. Missing/invalid inputs show a compact unavailable explanation. Existing bounded Investor Score, Confidence, Risk and valuation remain untouched.
- UI uses UI/UX Pro Max guidance: native keyboard disclosure, visible focus, minimum44px summary target, existing semantic tokens, wrapping narrow-screen metadata, no mandatory extra click flow or paid action.

## Trust boundary and remaining producer gate

An admission object is a server-owned assertion, **not cryptographic proof of source truth or authorization**. This reader must only receive the existing trusted report store after its current route authorization. Do not accept these objects from arbitrary API/model output. The next producer must resolve source snapshot content, verify claim/entity/value/unit/period support, bind authorized business/report revision and persist admissions immutably. It must establish distinct economic fact identity and reviewed normalization anchors. Merely setting reviewerId or hashing invented content cannot satisfy that upstream responsibility.

No extractor, report writer, account/credit route or model prompt currently produces this optional field. Therefore existing real reports will remain unavailable for the new index until that admission producer and profile are deliberately enabled; this commit must not be announced as all businesses having been rescored. No profile numbers are fabricated or inferred from current prose. Pure synthetic fixtures are the numeric proof path, not customer scores.

The existing `runId` is the reader's revision binding. Before mutable re-analysis writers produce this field, they must issue immutable revision IDs rather than overwrite an existing run; root's revision/consent work remains a dependency. Longitudinal delta display still needs persisted before/after snapshots with matching method/profile/coverage; current detail shows each contribution, not an invented growth delta.

## Focused verification

-10 scoring cases plus6 adapter cases pass with Node's builtin runner/type stripping; no dependency cache writes.
- Targeted TypeScript semantic check of the two pure scoring modules passes with no emit/incremental cache.
- No broad build/browser test, production data read/write, SQL, provider request or paid activation performed. Root owns final build/deployment.

## Lineage correction follow-up

Independent reviewer reproducers (`6a44b30`, cherry-picked as `f2bd992`) found same-timestamp ID sorting rejected valid parent/child corrections and an equal-value shortcut accepted invalid explicit parents. Fixed with iterative parent-first causal ordering within timestamp ties; missing, future-recorded and cyclic parents reject. Explicit supersedes now validates against and advances the current head even when the measured value is unchanged. Parentless identical reruns remain deduplicated and earn no points.

All21 focused cases pass: original16 + reviewer3 + cycle/future-parent and unchanged-head/fork regression cases. Targeted semantic TypeScript check of both pure modules passes without cache/emission. No deployment or shared dependency writes.
