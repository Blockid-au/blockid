# G30 supervised release verification

Production v3.29.1 / SHA f88ed0f90307e79c0581c1dd4ac4ac1d4f6398cd passed12/12 canonical release gates; gates completed08:15:08UTC. Tests:2039files passed/2skipped,41793tests passed/2skipped; hydrated public browser smoke140passed/2auth-skipped. No gates bypassed. Two earlier packaging attempts failed before traffic switch; the final packaging fix removed only traced runtime alias symlinks in the new unsealed candidate.

The complete deployment tool exited successfully. Independent checks afterwards confirmed system unit g30-origin-4101-3525721d9d-50b920bf47e2.service active, MainPID749255 unchanged, parentPID1, startTicks445575211, correct cgroup and release cwd /data/releases/on4GQhWkTQ5K8kjTVasPx. NRestarts0. Direct new-origin/public health returned the same version/SHA. Old4001 also remained healthy; it was not restarted. Actual Chromium homepage navigation at08:36:44UTC succeeded; its two existing console errors remain a separate CSP acceptance issue, not a clean-console claim.

After the30-minute gate interval, the existing controller acquired the shared deploy lock and --mark-good exited0. verifiedGood is now[4001,4101], active4101, previous4001; failed4100 remains quarantined and retained. At capture, 61 approximately30-second public samples since gates all returned200 and the expected SHA. [Sanitized samples/state](2026-09-22-g30-supervised-soak-evidence.json). These samples support the observed soak, not a guarantee of every request or absolute24/7 availability.

This successful supervised retry does not erase the earlier v3.29.0 incident and verified warm rollback. The new code preserves process lifetime beyond deployment tool exit; transient units still do not provide reboot recovery. O08 durable job/drain and O09 full local cold-start/restore remain open, and off-host backup remains deferred by founder. No paid analysis, customer message, payment or DB migration was performed for this verification.

The report/light/hero/final-projection foundation branch and new What-we-looked-at implementation are not included in this live SHA. They require their own integration, release gates and soak.
