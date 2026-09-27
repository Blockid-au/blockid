// Which cron-runner jobs the cron-health watchdog should EXPECT to run.
//
// 27/09 health sweep: /api/cron/cron-health reported false "missed" rows for
// jobs that are intentionally not running — retired (svi-notify, nurture),
// paused behind `# PAUSED-EMAIL` in scripts/crontab.production (svi-review,
// weekly-insights) or deferred by the G30 ownership admission in
// scripts/cron-runner.sh (publish-insight writes no health row while G30 owns
// it). The expectation now follows the crontab itself: a job is expected only
// when an active (uncommented) `$RUN <job>` line schedules it, so lifting a pause
// re-arms the check with no code change.

/** Endpoints cron-runner.sh defers (no HTTP, no health row) unless G30 status is "released". */
export const G30_GATED_ENDPOINTS: ReadonlySet<string> = new Set([
  "agent-orchestrator",
  "agent-auto-improve",
  "agent-deploy",
  "agent-healthcheck",
  "agent-guardian",
  "publish-insight",
]);

const RUNNER_CALL = /(?:\$RUN|\$\{RUN\}|cron-runner\.sh)\s+([A-Za-z0-9][A-Za-z0-9._-]*)/;

/**
 * Endpoints scheduled by ACTIVE (uncommented) crontab lines that call the
 * cron runner. `# PAUSED-EMAIL …: 0 19 * * * bash $RUN svi-review` is a
 * comment and therefore never counts.
 */
export function activeCrontabEndpoints(crontab: string): Set<string> {
  const out = new Set<string>();
  for (const raw of crontab.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    // `RUN=/…/cron-runner.sh` is the variable definition, not a job.
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(line)) continue;
    const m = RUNNER_CALL.exec(line);
    if (m) out.add(m[1]);
  }
  return out;
}

/**
 * Narrow a static expectation list to what is really scheduled.
 *   active      — `activeCrontabEndpoints(...)`, or null when the crontab
 *                 could not be read (then the static list is trusted).
 *   g30Released — G30 admission lets the gated writers through.
 */
export function scheduledEndpoints(
  expected: readonly string[],
  opts: { active: ReadonlySet<string> | null; g30Released: boolean },
): string[] {
  return expected.filter((ep) => {
    if (opts.active && !opts.active.has(ep)) return false;
    if (!opts.g30Released && G30_GATED_ENDPOINTS.has(ep)) return false;
    return true;
  });
}
