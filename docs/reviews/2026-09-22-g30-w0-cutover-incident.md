# G30 W0 cutover and recovery — 22 September 2026

**Disposition: candidate failed its soak; production restored to the verified v3.28.2 origin. W0 rollout is not complete.**

## Release and evidence

Candidate commit `1bcd6c8448e6eb63430cae4810e158779c9c4271`, version v3.29.0, immutable release `/data/releases/wzd_ZPSfbF75DAvVakPAF`, process 408501 on port 4100. The controlled deploy passed all 12 gates: secret scan, environment/dependency checks, TypeScript, ESLint (warnings remain), 41,757 unit tests (2 skipped), production build, 12 pre-promotion browser tests, 532-page/1,097-link check and 140 post-promotion browser tests (2 skipped). Gate completion was 06:46:39 UTC. These checks did not prove process survival after the launcher returned.

The prior origin, process 4147939 on port 4001, stayed running throughout. Its immutable identity is commit `3396adc00e78144ec86788db3fb03edf51abb1bc`, release `/data/releases/_XKtVSGWVG0gVr9TtMpey`.

## Incident and recovery

- 06:47:05: public status probe returned HTTP200 with candidate SHA.
- 06:47:35 and 06:48:05: public probes returned HTTP502. A real browser also observed homepage502 at06:47:47.
- Direct checks confirmed port4100 refused connections and candidate PID no longer existed; port4001 remained healthy.
- 06:48:27: root invoked the serialized warm-only rollback with expected active port4100 and deployment notifications disabled.
- 06:48:35: public probe returned HTTP200 with the prior SHA. The controller verified old process/cwd/socket/schema identity, restored stable state to4001 and quarantined4100. No cold restart was needed.

The 30-second sampling interval bounds detection; it does not establish an exact outage duration. Do not claim zero downtime or successful soak. Candidate metadata remains retained/quarantined and cannot be selected as known-good. No off-host backup was provisioned, per the founder's deferral.

## Process lifetime finding

The script launched the candidate using `nohup node server.js ... &`. No success-path kill or cleanup of that PID was found, and inspected kernel logs contained no OOM kill. Candidate logs had no fatal/shutdown record. Executor cleanup of an unsupervised descendant is the leading explanation; the original signal sender was not captured.

A disposable root probe reproduced the lifetime boundary: a `nohup sleep90` child disappeared immediately after its tool command completed, while an equivalent system-manager transient service remained active. This supports moving candidate ownership out of the launching tool process. Systemd257 is available; the user manager has linger disabled, so a system service running as the application user is the intended boundary.

Before another candidate promotion: implement service-owned launch, capture MainPID and exit/signal diagnostics, protect environment values from command arguments/logs, verify survival after launcher exit, preserve retained processes and detached work, then repeat release gates and the full soak. Service restart must not duplicate unfinished jobs; durable job/retirement work remains O08.

## Separate status-reporting defect

Candidate `/api/healthz` correctly reported v3.29.0 and its SHA, but `/api/status` reported the old version because its internal health probe hardcoded port4001. Its SHA came from its own manifest and remained correct after the pre-cutover stamp. The fix must probe the current process's validated port, not the globally active origin, so pre-promotion candidates can verify themselves.

The initial old SHA observed during temporary smoke preceded the script's manifest-copy step. Registration and cutover occurred only after stamping and identity verification; this was not an identity-gate bypass.

## Artifacts

Local investigation artifacts: `/tmp/g30-w0-attempt3-vitest.json`, `/tmp/g30-w0-attempt3-vitest.log`, `/tmp/g30-release-public-curl-health-extended.jsonl`, `/tmp/blockid-production-new.log`, and the controller's serving-state/deploy logs. These paths are evidence locations, not additional implementation plans. No report-quality, sale-ready or 24/7 availability certification follows from this release attempt.
