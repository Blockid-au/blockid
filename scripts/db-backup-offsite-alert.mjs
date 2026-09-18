// BlockID.au — off-site backup failure policy (G15-R3.2). Pure helpers used by
// scripts/db-backup-offsite.mjs so the "alert at most once per 24 h" rule and
// the founder-action row shape are unit-tested (db-backup-offsite-alert.test.mjs).
//
// Background (spec E4): the Drive service account has no storage quota, so the
// 02:40 UTC upload fails every night until the founder runs the one-time OAuth
// consent. The nightly Telegram alert became noise. Policy now:
//   • local retention is never touched by the off-site job (it only reads
//     /data/backups) — the row says so explicitly;
//   • the health row carries `offsite_status: "founder_action_required"` plus
//     the exact command when the failure is the credentials / quota class,
//     `offsite_status: "fail"` for anything else;
//   • Telegram fires on the FIRST failure, then at most once per 24 h while the
//     same error class persists; a new error class alerts immediately; a
//     success clears the state so the next failure alerts again.

export const FOUNDER_COMMAND = "node --env-file=web/.env scripts/db-backup-offsite-auth.mjs";
// 20 h, not 24: the nightly cron fires every 24 h ± jitter, so a 24 h window
// would alert only every second night (review 2026-09-18).
export const ALERT_WINDOW_MS = 20 * 60 * 60 * 1000;

/** Coarse error class — decides whether the fix is founder-only and drives the debounce key. */
export function classifyOffsiteError(message) {
  const m = String(message ?? "");
  if (/do not have storage quota|has no Drive quota|storage quota/i.test(m)) return "no_drive_quota";
  if (/invalid_grant|invalid_client|unauthorized_client|Token has been expired or revoked|no Drive credentials|GOOGLE_DRIVE_FOLDER_ID .* not set/i.test(m)) return "credentials";
  if (/ENOTFOUND|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|fetch failed|5\d\d/i.test(m)) return "network";
  if (/no db-.*\.dump\.gz|sha256 mismatch|ENOENT/i.test(m)) return "local_backup";
  return "other";
}

/** Founder must act (credentials / quota) — the cron cannot fix it by retrying. */
export function isFounderActionClass(cls) {
  return cls === "no_drive_quota" || cls === "credentials";
}

/**
 * Debounce decision. `state` is the persisted JSON ({ last_alert_at, error_class,
 * suppressed }) or null. Returns { alert: boolean, reason, next } where `next`
 * is the state to persist.
 */
export function decideOffsiteAlert(state, errorClass, now = Date.now(), windowMs = ALERT_WINDOW_MS) {
  const last = state && typeof state.last_alert_at === "string" ? Date.parse(state.last_alert_at) : NaN;
  const sameClass = !!state && state.error_class === errorClass;
  const suppressed = Number.isInteger(state?.suppressed) ? state.suppressed : 0;
  let alert;
  let reason;
  if (Number.isNaN(last)) {
    alert = true;
    reason = "first_failure";
  } else if (!sameClass) {
    alert = true;
    reason = "error_class_changed";
  } else if (now - last >= windowMs) {
    alert = true;
    reason = "window_elapsed";
  } else {
    alert = false;
    reason = "debounced";
  }
  const next = alert
    ? { last_alert_at: new Date(now).toISOString(), error_class: errorClass, suppressed: 0 }
    : { ...state, suppressed: suppressed + 1 };
  return { alert, reason, next };
}

/** Fields merged into the {job:"offsite", status:"fail"} health row. */
export function offsiteFailureFields(errorClass, { alerted, suppressed = 0 } = {}) {
  const founder = isFounderActionClass(errorClass);
  const fields = {
    offsite_status: founder ? "founder_action_required" : "fail",
    error_class: errorClass,
    local_retention: "untouched",
    alerted: !!alerted,
    alerts_suppressed_since_last: suppressed,
  };
  if (founder) {
    fields.founder_command = FOUNDER_COMMAND;
    fields.founder_action = "Run the command once as admin@blockid.au, add the printed GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN= to web/.env, re-run scripts/db-backup-offsite.mjs. Runbook: docs/runbooks/db-restore.md § Off-site.";
  }
  return fields;
}
