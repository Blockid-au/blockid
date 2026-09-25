// G15 review 2026-09-18 — ops-alert e-mail with NO lib/email.ts import.
// `lib/telegram.ts` must not pull `lib/email.ts` (→ lib/auth → next/headers),
// which would make every public page that can alert request-bound
// (`public-cacheable-routes` guard).
//
// G34-BT2 EM07: the alert now goes through the shared transport
// (`lib/email-core.ts` sendEmail — erased-recipient guard + `email_sends`
// log, T-class, flow "ops-alert") instead of a raw nodemailer transport.
// email-core carries no app imports, so the guard above still holds.
import { sendEmail } from "./email-core";

export async function sendOpsAlertEmail(args: { to: string; subject: string; text: string }): Promise<boolean> {
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
