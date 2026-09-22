# G30 foundation live —22 September2026

v3.30.0, SHAfb4c4a39618b1fcd111719f8ed9c93ec8139e692, retained port4103,
release pIMND1sAWXuzOPrkoqsyH, PID1102099/startTicks446134384.
Systemd unit g30-origin-4103-ec1d20323c-8eaab902717f.service remained
active with NRestarts0 after deploy command exited0.

Build, environment/database, endpoint/static checks and12 candidate browser
smokes passed. Deploy records8/10 gates; full unit and hydrated/contrast suites
were deferred explicitly, as was broad link crawling. No full review pass.
Public samples from09:47:11UTC return200 and expected SHA. Explicit60-second
operational soak completed and mark-good --review-deferred succeeded.

Manual live homepage browser confirmed new business headline, input present,
body background rgb(255,255,255), body text rgb(30,41,59), headline
rgb(11,15,26). Two pre-existing console errors remain; this does not verify
every page, authenticated flows, exports or report accuracy.

Rollback target is compatible reader v3.29.2 on4102. Older4001/4101 were
quarantined from rollback eligibility under deploy lock because their readers
reject new unavailable valuations. Their processes and pins remain intact;
this is not job retirement. Failed4100 remains quarantined.

No database migration or new paid provider/evaluation was activated.
