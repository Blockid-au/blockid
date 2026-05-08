import { NextResponse } from "next/server";
import { z } from "zod";
import {
  cofounderProfileSchema,
  type CofounderProfileInput,
} from "@/lib/cofounder-match";
import { insertCofounderProfile } from "@/lib/cofounder-match.server";
import { hashIp, clientIpFromHeaders } from "@/lib/iphash";
import { getResend, isResendConfigured } from "@/lib/email";

// POST /api/cofounder-match
// Validates a cofounder profile submission, hashes the client IP for soft
// rate-limit attribution, persists to Supabase, and fires off two notification
// emails (founder + admin) via the existing Resend wrapper. Email is
// fire-and-forget — we never block the funnel on transactional infra.
export async function POST(request: Request) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = cofounderProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "Validation failed",
        issues: z.treeifyError(parsed.error),
      },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const ipHash = hashIp(clientIpFromHeaders(request.headers));

  const result = await insertCofounderProfile({ input, ipHash });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: "Could not save profile" },
      { status: 500 },
    );
  }

  // Fire-and-forget notification emails. Don't block the response.
  void sendNotificationEmails(input, result.id).catch((err) => {
    console.error("[blockid:cofounder-match] notify failed", err);
  });

  return NextResponse.json({ ok: true, id: result.id });
}

export const dynamic = "force-dynamic";

// -----------------------------------------------------------------------------
// Notification emails — minimal inline HTML, navy/teal palette, no externals.
// We call resend directly here (rather than adding new exports to email.ts)
// to keep this feature self-contained.
// -----------------------------------------------------------------------------

const FROM_DEFAULT = "BlockID <noreply@blockid.au>";

function fromAddress(): string {
  return process.env.RESEND_FROM_EMAIL || FROM_DEFAULT;
}

function adminEmail(): string {
  return process.env.BLOCKID_ADMIN_EMAIL || "admin@blockid.au";
}

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}

async function sendNotificationEmails(
  input: CofounderProfileInput,
  id: string,
): Promise<void> {
  if (!isResendConfigured()) {
    console.warn(
      "[blockid:cofounder-match] Resend not configured — skipping emails",
      { id, email: input.email },
    );
    return;
  }
  const resend = getResend();
  if (!resend) return;

  const from = fromAddress();
  const directoryUrl = `${siteUrl()}/tools/cofounder-match`;

  // Founder confirmation.
  try {
    const r1 = await resend.emails.send({
      from,
      to: input.email,
      subject: "You're on the BlockID Cofounder Match list",
      html: founderHtml({ input, directoryUrl }),
    });
    if (r1.error) throw r1.error;
  } catch (err) {
    console.error("[blockid:cofounder-match] founder email failed", err);
  }

  // Admin alert.
  try {
    const r2 = await resend.emails.send({
      from,
      to: adminEmail(),
      subject: `New cofounder profile — ${input.fullName}`,
      html: adminHtml({ input, id }),
    });
    if (r2.error) throw r2.error;
  } catch (err) {
    console.error("[blockid:cofounder-match] admin email failed", err);
  }
}

function shell(body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BlockID — Cofounder Match</title></head><body style="margin:0;padding:0;background:#0B1220;color:#F8FAFC;font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;">${body}</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function founderHtml(args: {
  input: CofounderProfileInput;
  directoryUrl: string;
}): string {
  const { input, directoryUrl } = args;
  return shell(`
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B1220;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0F172A;border:1px solid #1F2A44;border-radius:16px;padding:32px;">
        <tr><td>
          <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#0FB5A9;font-weight:500;">BlockID — Cofounder Match</p>
          <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:600;color:#F8FAFC;letter-spacing:-0.01em;">You're on the list, ${escapeHtml(input.fullName.split(/\s+/)[0] ?? "founder")}</h1>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:15px;line-height:1.6;">Thanks for joining the BlockID Cofounder Match directory. We'll reach out when we have profiles that look like a fit. In the meantime your anonymized card is live on the directory.</p>
          <p style="margin:0;text-align:center;">
            <a href="${directoryUrl}" style="display:inline-block;background:#0FB5A9;color:#0B1220;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:15px;">View the directory</a>
          </p>
          <hr style="border:none;border-top:1px solid #1F2A44;margin:32px 0 16px 0;">
          <p style="margin:0;color:#64748B;font-size:12px;line-height:1.6;">BlockID — match before you incorporate, fight, or fork.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>`);
}

function adminHtml(args: {
  input: CofounderProfileInput;
  id: string;
}): string {
  const { input, id } = args;
  const lines: [string, string][] = [
    ["ID", id],
    ["Name", input.fullName],
    ["Email", input.email],
    ["Location", input.location],
    ["I am", input.iAm.join(", ")],
    ["Looking for", input.lookingFor.join(", ")],
    ["Stage", input.stage],
    ["Time", input.timeCommitment],
    ["Visibility", input.visibility],
    ["LinkedIn", input.linkedinUrl || "—"],
    ["Skills", input.skills || "—"],
    ["Pitch", input.ideaPitch || "—"],
  ];
  const rows = lines
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#64748B;font-size:12px;text-transform:uppercase;letter-spacing:0.12em;vertical-align:top;">${escapeHtml(k)}</td><td style="padding:6px 0;color:#F8FAFC;font-size:14px;">${escapeHtml(v)}</td></tr>`,
    )
    .join("");
  return shell(`
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B1220;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0F172A;border:1px solid #1F2A44;border-radius:16px;padding:32px;">
        <tr><td>
          <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#0FB5A9;font-weight:500;">BlockID — Internal</p>
          <h1 style="margin:0 0 16px 0;font-size:20px;font-weight:600;color:#F8FAFC;letter-spacing:-0.01em;">New cofounder profile</h1>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
        </td></tr>
      </table>
    </td></tr>
  </table>`);
}
