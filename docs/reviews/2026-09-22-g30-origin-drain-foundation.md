# O08 retained-origin drain — source implementation and legacy evidence

Branch fromfb4c4a396. No process stop/restart, database mutation, proxy switch, state mutation or capacity increase was performed. Existing retained_capacity missing-PID/quarantine behavior is preserved.

## New-runtime implementation

Next's Node instrumentation installs HTTP admission tracking before readiness. Every ordinary request persists an activity before invoking the HTTP handler; response finish/close ends transport tracking. During explicit drain, new ordinary requests receive503/Retry-After while health, status and authenticated drain control stay accessible. Existing request contexts can continue their work; drain does not abort requests or provider calls.

The private per-PID/startTicks registry records activity class/start time only, without request URLs, customer IDs, deck data, credentials or report contents. It persists admission/completion and drain/resume with fsync/atomic rename. A missing/unreliable registry is not a quiescence proof. Startup cannot silently reuse an existing process registry.

Separate awaited scopes cover the central report pipeline, callAI including its wait queue, report-order worker, actual audit sink write, and detached pipeline notification/email promises. HTTP response close therefore cannot erase a still-running tracked report or email. Audit tracking wraps the underlying sink, not the outer timeout race, which otherwise returns while the actual write can continue. Tracking is inert where startup instrumentation is absent (unit tests/legacy processes); absence is explicit unknown.

Authenticated `/api/ops/origin-drain` GET returns current evidence. POST with `{"action":"drain"}` closes admission; `{"action":"resume"}` explicitly reopens it, preserving tracked work. These mutations are source only and were not called live. A drained origin cannot serve as an ordinary rollback until explicitly resumed and verified. Health/status staying200 does NOT mean customer routes are admitted.

**Coverage is deliberately partial:** every snapshot reports `retirementEligible:false`, even when `trackedWorkDrained:true`. Other detached tasks, external workers/child processes and durable DB ownership/ambiguous effects still require integration. No zero counter or elapsed duration closes those gaps. HTTP upgrade connections are not covered by the ordinary request hook. Startup behavior and hook ordering still require an isolated real Next server fixture before production rollout; per-request synchronous durable writes also need a throughput check before making performance claims.

## Read-only legacy observation

At the bounded observation,4001/4101/4102 matched recorded PID/startTicks and release cwd. Each had a listening socket and two established sockets whose peer port was Redis6379. This distinguishes them from observed active HTTPS requests at that instant, but does not prove no queued work, delayed promise, DB lease or future continuation. Live4103 was serving and showed additional activity. The dead quarantined4100 remains governed by existing capacity logic, not a new retirement decision.

Source findings:

- AI concurrency/wait queues are in-process; per-call worker/provider timeouts do not impose a proven whole-report completion bound across fallback, retries and subsequent side effects.
- `runReportPipeline` starts notification/email promises without awaiting them; their lifespan can exceed SSE completion.
- Audit's timeout race is not cancellation of its DB write.
- Report order queue uses queued/running/terminal states and claim guards, but inspected worker rows do not carry release PID/startTicks ownership. A queued/running aggregate cannot attribute work to one retained origin.
- Source cron runner resolves stable active origin before POST but allows an already-admitted old request to finish. Old processes cannot gain a trustworthy admission registry merely by inspecting them later.

`web/scripts/g30-origin-quiescence.py --web <web> --port <retained-port>` is executable read-only inspection: validates process identity, reports socket-state/peer-port classes without addresses or secrets, privately probes the runtime registry if available, and revalidates PID identity. It always refuses to infer retirement eligibility. It does not attach a debugger or inject instrumentation into legacy processes.

## Safe operational sequence / exact remaining legacy blocker

1. Keep current traffic and a semantically compatible verified rollback origin. Before draining an inactive compatible origin, confirm authoritative proxy/cron routing no longer admits new business requests to it; close authenticated admission via its runtime control.
2. Observe tracked scopes to completion, retaining persisted evidence. Reconcile durable jobs and external effects with originating-release ownership; add missing scopes rather than declaring an empty partial registry complete.
3. A legacy origin without startup registry has no current source-supported complete quiescence proof. Socket inactivity, Redis-only connections, old last-access time, zero AI queue and “wait N minutes” are insufficient separately or together to establish absent detached jobs. Preserve it and report the unresolved coverage; any different operational decision requires an explicit scoped risk decision, not a fabricated test pass.
4. No kill/retire command is included. Completing durable job ownership/checkpoints and full background-task registration is required before an automated retirement controller can legitimately free a live slot. Retain artifacts/pins regardless; don't enlarge cap to hide this prerequisite.

Installed Next shutdown source was inspected: production SIGTERM waits server.close and Next close then explicitly process.exit(143). This is transport/framework cleanup, not proof arbitrary detached promises or external jobs settled. No signal was sent.

Private status now exposes origin_draining; serving-state verification refuses an admission-closed runtime as a serving/rollback target until explicit resume. Existing health/status200 cannot silently promote an origin that rejects customer traffic. Unknown legacy flag remains unknown, not evidence of quiescence; existing root semantic quarantine is separate.

Validation:4 registry cases plus1 real local Node HTTP admission/drain fixture passed; scoped registry/hook TypeScript check passed. This is not a production Next fixture or full background-job drain acceptance.

## Real Next follow-up before rollout

Root ran the installed Next production build/start on a minimal localhost
fixture using the actual registry and HTTP hook. Strict Next typechecking
caught three overloaded emit spread errors; fixed using Reflect.apply.
Startup installed the registry in the serving PID; drain rejected new work,
a detached tracked email remained visible after HTTP completion, explicit
release settled it, and resume restored ordinary requests. Retirement
eligibility remained false. Empty/invalid drain actions now return400.

One bounded HTML sample with tracking/fsync enabled:60 requests, concurrency4,
559ms total,49ms p95. This is not production load or full job coverage proof.
Fixture uses no database, production credentials, model calls or network
research. `web/scripts/ops/check-next-origin-drain.mjs` is the reproducible
runner; only fixture-owned processes are started/stopped.
