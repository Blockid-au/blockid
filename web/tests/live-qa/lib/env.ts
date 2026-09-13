/**
 * Live-QA environment flags — one place, read once, never logged with values
 * other than booleans. See docs/ops/live-qa.md.
 */
/** The run's founder account. */
export const QA_EMAIL_RE = /^qa-live-\d{8}-\d{4}@blockid\.au$/;
/** The run's second (member-lane) account — same stamp, `member-` infix. */
export const QA_MEMBER_EMAIL_RE = /^qa-live-member-\d{8}-\d{4}@blockid\.au$/;
/** Either live-QA address — the only addresses any DB / erase step may touch. */
export const QA_ANY_EMAIL_RE = /^qa-live-(member-)?\d{8}-\d{4}@blockid\.au$/;

function on(name: string): boolean {
  const v = (process.env[name] ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export const env = {
  baseURL: (process.env.LIVE_QA_BASE_URL ?? "https://blockid.au").replace(/\/+$/, ""),
  /** Permit the local `docker exec supabase-db psql` steps. */
  allowDb: on("LIVE_QA_ALLOW_DB"),
  /** Set app_users.plan='growth' for the QA email (needs allowDb). */
  elevate: on("LIVE_QA_ELEVATE"),
  /** Allow confirming an action that costs credits. Default: never. */
  spendOk: on("LIVE_QA_SPEND_OK"),
  /** Debugging only: leave the QA account in place (the teardown still refuses silently-lingering accounts in cron because the runner never sets this). */
  keepAccount: on("LIVE_QA_KEEP_ACCOUNT"),
  /** Reuse an existing run state instead of provisioning (debugging a single spec). */
  reuseState: on("LIVE_QA_REUSE_STATE"),
} as const;

/** `qa-live-<yyyymmdd-hhmm>@blockid.au` in UTC. */
export function qaEmailForNow(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
  return `qa-live-${stamp}@blockid.au`;
}

/** `qa-live-member-<stamp>@blockid.au` for the founder address of the same run. */
export function memberEmailFor(founderEmail: string): string {
  const m = /^qa-live-(\d{8}-\d{4})@blockid\.au$/.exec(founderEmail);
  if (!m) throw new Error(`not a live-QA founder address: ${founderEmail}`);
  return `qa-live-member-${m[1]}@blockid.au`;
}
