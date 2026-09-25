// G34-BT4 — rollout switch for the lifecycle flows (plan §10 BT4: "dry-run
// 24 h, log the would-be recipients → founder reviews samples → enable").
//
//   LIFECYCLE_EMAIL=off   the scan crons answer `disabled`; EM12 queues nothing
//   LIFECYCLE_EMAIL=dry   (default, also when unset) the scan crons run as
//                         `?dry=1` — read everything, list would-be
//                         recipients, write nothing; EM12 only logs
//   LIFECYCLE_EMAIL=live  the scan crons queue rows (a manual `?dry=1` still
//                         forces a dry run); EM12 queues score_updated
//
// Engine changes that are not new flows (quiet hours, batch priority, the
// re-timed onboarding steps) do not read this switch.

export type LifecycleMode = "off" | "dry" | "live";

export function lifecycleMode(env: NodeJS.ProcessEnv = process.env): LifecycleMode {
  const v = (env.LIFECYCLE_EMAIL ?? "").trim().toLowerCase();
  if (v === "off") return "off";
  if (v === "live") return "live";
  return "dry";
}
