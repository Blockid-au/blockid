// G15 review 2026-09-18 — ops-alert e-mail transport with NO app imports.
// `lib/telegram.ts` must not pull `lib/email.ts` (→ lib/auth → next/headers),
// which would make every public page that can alert request-bound
// (`public-cacheable-routes` guard). Same SMTP env as lib/email, nothing else.
import nodemailer from "nodemailer";

export async function sendOpsAlertEmail(args: { to: string; subject: string; text: string }): Promise<boolean> {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) return false;
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: { user, pass },
  });
  const from = process.env.SMTP_FROM_EMAIL || user;
  await transporter.sendMail({ from: `BlockID ops <${from}>`, to: args.to, subject: args.subject.slice(0, 180), text: args.text });
  return true;
}
