# G30 SVI proxy policy implementation

The BlockID `/api/investor-portal/ai-generate` server adapter now selects
`blockid-report-v1` itself: DeepInfra first, then the dispatcher’s qualified
free alternatives. Request input cannot select another provider policy.
Both initial generation and optional JSON repair share one absolute deadline;
numeric request options are bounded and actual `via`/model/policy metadata is
returned instead of only the legacy coarse provider label.

Four local mocked route tests passed: policy/input bounds, shared repair
deadline, configured-token rejection before AI work, and failure propagation.
No model/provider calls or customer charges were made. This is source-level
coverage; no quality, quota, latency or paid cross-site acceptance claim.

This updates only the BlockID proxy. SVI has a separate local fallback chain
and an internal-base configuration whose source default points at port4001.
Promotion of a new BlockID origin alone does not prove SVI requests reach it.
Before calling the cross-site routing gate complete, resolve SVI to the active
origin, verify effective runtime server authentication, and prevent its local
chain from silently using other paid providers. Initial process environment
inspection is not proof of all runtime dotenv/config values. Signed identity
handoff does not establish resource ownership or a shared wallet.

No SVI source, service, endpoint authorization rules, prices, database schema,
existing report heads or billing activation changed in this slice.
