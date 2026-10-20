// G15 review 2026-09-18 — ops-alert e-mail with NO lib/email.ts import.
// `lib/telegram.ts` must not pull `lib/email.ts` (→ lib/auth → next/headers),
// which would make every public page that can alert request-bound
// (`public-cacheable-routes` guard).
//
// G34-BT2 EM07: the alert now goes through the shared transport
// (`lib/email-core.ts` sendEmail — erased-recipient guard + `email_sends`
// log, T-class, flow "ops-alert") instead of a raw nodemailer transport.
// email-core carries no app imports, so the guard above still holds.
//
// O1 / L1-12: `dedup: true` (set by lib/telegram.ts for ops-alert texts, never
// for business notifications) applies the shared per-(kind, level, UTC day)
// rule from scripts/lib/ops-alert-dedup.mjs against the same runtime state
// file the script path uses: P0/P1 always sent, a P2 once per kind per day,
// its repeats held for the daily digest (`ops-alert-email.mjs --digest`).
import { sendEmail } from "./email-core";
import { DEDUP_STATE_FILE, decide, readDedupState, writeDedupState } from "../../scripts/lib/ops-alert-dedup.mjs";
import { runtimeReportsPath } from "./runtime-paths";

export type OpsAlertEmailArgs = {
  to: string;
  subject: string;
  text: string;
  /** "P0" | "P1" | "P2"; omitted ⇒ inferred from subject + text. */
  level?: string;
  /** Apply the per-day dedup (ops alerts only). */
  dedup?: boolean;
  /** Test hooks. */
  stateFile?: string;
  now?: number;
};

export type OpsAlertDedupVerdict = { send: boolean; level: string; kind: string; reason: string };

/** Run the shared dedup rule and persist the state. Exported for the test. */
export function opsAlertDedup(args: Pick<OpsAlertEmailArgs, "subject" | "text" | "level" | "stateFile" | "now">): OpsAlertDedupVerdict {
  const file = args.stateFile ?? runtimeReportsPath(DEDUP_STATE_FILE);
  const v = decide(readDedupState(file), { subject: args.subject, body: args.text, level: args.level ?? "" }, args.now ?? Date.now());
  writeDedupState(file, v.state);
  return { send: v.send, level: v.level, kind: v.kind, reason: v.reason };
}

/**
 * true = delivered, or deliberately held for the daily digest (a repeat P2 is
 * not a failure the caller should retry or log); false = delivery failed.
 */
export async function sendOpsAlertEmail(args: OpsAlertEmailArgs): Promise<boolean> {
  if (args.dedup) {
    const verdict = opsAlertDedup(args);
    if (!verdict.send) return true;
  }
  const escaped = args.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const result = await sendEmail({
    to: args.to,
    subject: args.subject.slice(0, 180),
    html: `<pre style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;white-space:pre-wrap;">${escaped}</pre>`,
    text: args.text,
    fromName: "BlockID ops",
    flow: "ops-alert",
    template: "ops_alert",
  });
  return result.ok;
}
