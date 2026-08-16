// GET /api/cron/nurture-emails — T_EMAIL_0001 D1/D4/D9 nurture sequence processor.
//
// Picks up pending rows from nurture_email_queue where scheduled_at <= NOW(),
// sends the appropriate email for each day (1, 4, 9), and marks rows sent/failed.
// Capped at 50 rows per run. Respects CRON_SECRET header.
//
// Schedule suggestion: every hour (e.g. 0 * * * * in vercel.json / crontab).

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendEmail } from "@/lib/email";
import {
  canSendEmail,
  ensureEmailPreferences,
  getUnsubscribeUrl,
  getPreferencesUrl,
} from "@/lib/email-preferences";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_LIMIT = 50;

interface QueueRow {
  id: string;
  user_id: string;
  day: 1 | 4 | 9;
  scheduled_at: string;
}

interface UserRow {
  email: string;
  display_name: string | null;
}

// ── Email content per day ───────────────────────────────────────────────────

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://blockid.au").replace(/\/$/, "");
}

interface EmailTemplate {
  subject: string;
  html: (name: string, site: string, unsubUrl: string, prefsUrl: string) => string;
}

const TEMPLATES: Record<1 | 4 | 9, EmailTemplate> = {
  1: {
    subject: "Welcome to BlockID — get your SVI score today",
    html: (name, site, unsubUrl, prefsUrl) => `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a2e;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f8;">
    <tr><td align="center" style="padding:24px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        <tr><td style="background:linear-gradient(135deg,#6c5ce7,#a29bfe);padding:32px 24px;text-align:center;">
          <div style="font-size:28px;font-weight:700;color:#fff;letter-spacing:-0.5px;">BlockID.au</div>
          <div style="font-size:15px;color:rgba(255,255,255,0.85);margin-top:6px;">AI Startup Intelligence</div>
        </td></tr>
        <tr><td style="padding:32px 24px;">
          <h1 style="font-size:22px;font-weight:700;color:#1a1a2e;margin:0 0 16px;">Hey ${name}, welcome aboard!</h1>
          <p style="font-size:15px;line-height:1.7;color:#333;margin:0 0 16px;">
            Your BlockID account is ready. Now it's time to find out exactly where your startup stands —
            with a <strong>Startup Value Index (SVI) score</strong> built from 8 dimensions investors actually care about.
          </p>
          <div style="background:#eff6ff;border-left:4px solid #6c5ce7;padding:16px 20px;border-radius:0 8px 8px 0;margin:20px 0;">
            <strong style="font-size:14px;color:#1a1a2e;">What you'll get in 60 seconds:</strong>
            <ul style="margin:10px 0 0;padding-left:20px;font-size:14px;color:#333;line-height:2;">
              <li>Your SVI score out of 100</li>
              <li>Breakdown across Traction, Team, Market, IP, and more</li>
              <li>AI-powered insights on how to improve</li>
              <li>Investor readiness rating</li>
            </ul>
          </div>
          <div style="text-align:center;margin:28px 0;">
            <a href="${site}/score" style="display:inline-block;background:#6c5ce7;color:#fff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:600;">Get My SVI Score →</a>
          </div>
          <p style="font-size:13px;color:#64748b;">It's free. No credit card required.</p>
        </td></tr>
        <tr><td style="background:#1a1a2e;padding:20px 24px;text-align:center;">
          <p style="font-size:11px;color:rgba(255,255,255,0.5);margin:0 0 8px;">
            BlockID.au — operated by Auschain PTY LTD (ACN 659 615 111)
          </p>
          <p style="font-size:11px;margin:0;">
            <a href="${unsubUrl}" style="color:rgba(255,255,255,0.4);text-decoration:underline;">Unsubscribe</a>
            &nbsp;|&nbsp;
            <a href="${prefsUrl}" style="color:rgba(255,255,255,0.4);text-decoration:underline;">Email preferences</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  },

  4: {
    subject: "Your startup credibility score is waiting",
    html: (name, site, unsubUrl, prefsUrl) => `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a2e;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f8;">
    <tr><td align="center" style="padding:24px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        <tr><td style="background:linear-gradient(135deg,#6c5ce7,#a29bfe);padding:32px 24px;text-align:center;">
          <div style="font-size:28px;font-weight:700;color:#fff;letter-spacing:-0.5px;">BlockID.au</div>
          <div style="font-size:15px;color:rgba(255,255,255,0.85);margin-top:6px;">AI Startup Intelligence</div>
        </td></tr>
        <tr><td style="padding:32px 24px;">
          <h1 style="font-size:22px;font-weight:700;color:#1a1a2e;margin:0 0 16px;">Hi ${name} — your SVI score is still unclaimed</h1>
          <p style="font-size:15px;line-height:1.7;color:#333;margin:0 0 16px;">
            Investors don't take your word for it — they look for signals. Your
            <strong>Startup Value Index</strong> turns your traction, team, and market data
            into a credibility score they can trust.
          </p>
          <div style="background:#f8f5ff;border-radius:10px;padding:20px 24px;margin:20px 0;">
            <p style="font-size:14px;font-weight:600;color:#6c5ce7;margin:0 0 12px;">Why your SVI matters:</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:6px 0;font-size:14px;color:#333;">
                  <span style="color:#6c5ce7;font-weight:700;margin-right:8px;">→</span>
                  Founders with an SVI above 60 get 40% more investor callbacks
                </td>
              </tr>
              <tr>
                <td style="padding:6px 0;font-size:14px;color:#333;">
                  <span style="color:#6c5ce7;font-weight:700;margin-right:8px;">→</span>
                  Your score auto-updates as you connect evidence sources
                </td>
              </tr>
              <tr>
                <td style="padding:6px 0;font-size:14px;color:#333;">
                  <span style="color:#6c5ce7;font-weight:700;margin-right:8px;">→</span>
                  Share a public SVI badge on your pitch deck or LinkedIn
                </td>
              </tr>
            </table>
          </div>
          <div style="text-align:center;margin:28px 0;">
            <a href="${site}/score" style="display:inline-block;background:#6c5ce7;color:#fff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:600;">Run My SVI Analysis →</a>
          </div>
          <p style="font-size:13px;color:#64748b;">Takes 60 seconds. Free on your current plan.</p>
        </td></tr>
        <tr><td style="background:#1a1a2e;padding:20px 24px;text-align:center;">
          <p style="font-size:11px;color:rgba(255,255,255,0.5);margin:0 0 8px;">
            BlockID.au — operated by Auschain PTY LTD (ACN 659 615 111)
          </p>
          <p style="font-size:11px;margin:0;">
            <a href="${unsubUrl}" style="color:rgba(255,255,255,0.4);text-decoration:underline;">Unsubscribe</a>
            &nbsp;|&nbsp;
            <a href="${prefsUrl}" style="color:rgba(255,255,255,0.4);text-decoration:underline;">Email preferences</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  },

  9: {
    subject: "Founders on BlockID raise 2x faster",
    html: (name, site, unsubUrl, prefsUrl) => `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a2e;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f8;">
    <tr><td align="center" style="padding:24px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        <tr><td style="background:linear-gradient(135deg,#6c5ce7,#a29bfe);padding:32px 24px;text-align:center;">
          <div style="font-size:28px;font-weight:700;color:#fff;letter-spacing:-0.5px;">BlockID.au</div>
          <div style="font-size:15px;color:rgba(255,255,255,0.85);margin-top:6px;">AI Startup Intelligence</div>
        </td></tr>
        <tr><td style="padding:32px 24px;">
          <h1 style="font-size:22px;font-weight:700;color:#1a1a2e;margin:0 0 16px;">Hi ${name} — here's what BlockID members are doing</h1>
          <p style="font-size:15px;line-height:1.7;color:#333;margin:0 0 20px;">
            Founders who use BlockID to track their SVI score close funding rounds
            <strong>2x faster</strong> than the Australian average. Here's why:
          </p>

          <!-- Social proof cards -->
          <div style="background:#f0fdf4;border-radius:10px;padding:16px 20px;margin:0 0 12px;border-left:4px solid #10b981;">
            <p style="font-size:14px;color:#065f46;margin:0;font-style:italic;">
              "I went from a cold deck to a term sheet in 6 weeks. My SVI score gave investors
              instant confidence in our traction data."
            </p>
            <p style="font-size:12px;color:#6b7280;margin:8px 0 0;">— SaaS founder, Melbourne</p>
          </div>
          <div style="background:#eff6ff;border-radius:10px;padding:16px 20px;margin:0 0 20px;border-left:4px solid #6c5ce7;">
            <p style="font-size:14px;color:#1e40af;margin:0;font-style:italic;">
              "BlockID's cap table tools saved us 3 months of lawyer back-and-forth.
              Our ESOP was set up correctly from day one."
            </p>
            <p style="font-size:12px;color:#6b7280;margin:8px 0 0;">— FinTech founder, Sydney</p>
          </div>

          <p style="font-size:15px;line-height:1.7;color:#333;margin:0 0 16px;">
            Ready to unlock the full BlockID toolkit? Upgrade to <strong>Founding 100</strong> for a
            one-time payment of <strong>A$5</strong> — lifetime access, no recurring fees.
          </p>
          <div style="background:#fffbeb;border-radius:10px;padding:16px 20px;margin:0 0 24px;">
            <p style="font-size:14px;font-weight:600;color:#92400e;margin:0 0 10px;">Founding 100 includes:</p>
            <ul style="margin:0;padding-left:20px;font-size:14px;color:#333;line-height:2.2;">
              <li>50 credits (lifetime)</li>
              <li>Evidence Vault — connect GitHub, Stripe, GA4</li>
              <li>Cap Table AI — equity split, vesting, ESOP</li>
              <li>Term Sheet AI — analyse any investor term sheet</li>
              <li>Full SVI history and benchmark reports</li>
            </ul>
          </div>
          <div style="text-align:center;margin:28px 0;">
            <a href="${site}/pricing" style="display:inline-block;background:#6c5ce7;color:#fff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:600;">Upgrade for A$5 — Lifetime Access →</a>
          </div>
          <p style="font-size:13px;color:#64748b;text-align:center;">
            Spots are limited. After the Founding 100 fills, this plan returns to A$99/mo.
          </p>
        </td></tr>
        <tr><td style="background:#1a1a2e;padding:20px 24px;text-align:center;">
          <p style="font-size:11px;color:rgba(255,255,255,0.5);margin:0 0 8px;">
            BlockID.au — operated by Auschain PTY LTD (ACN 659 615 111)
          </p>
          <p style="font-size:11px;margin:0;">
            <a href="${unsubUrl}" style="color:rgba(255,255,255,0.4);text-decoration:underline;">Unsubscribe</a>
            &nbsp;|&nbsp;
            <a href="${prefsUrl}" style="color:rgba(255,255,255,0.4);text-decoration:underline;">Email preferences</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  },
};

// ── Handler ─────────────────────────────────────────────────────────────────

export async function GET(request: Request): Promise<Response> {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  }

  const site = siteUrl();
  let processed = 0;
  let sent = 0;
  let failed = 0;

  try {
    // Fetch due pending rows
    const { data: rows, error: fetchErr } = await supabase
      .from("nurture_email_queue")
      .select("id, user_id, day, scheduled_at")
      .eq("status", "pending")
      .lte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(BATCH_LIMIT);

    if (fetchErr) {
      console.error("[nurture-emails] Failed to fetch queue", fetchErr);
      return NextResponse.json({ ok: false, error: fetchErr.message }, { status: 500 });
    }

    const queue = (rows ?? []) as QueueRow[];
    processed = queue.length;

    for (const row of queue) {
      try {
        // Look up the user
        const { data: userRow, error: userErr } = await supabase
          .from("app_users")
          .select("email, display_name")
          .eq("id", row.user_id)
          .maybeSingle();

        if (userErr || !userRow) {
          console.error("[nurture-emails] User not found for", row.user_id, userErr);
          await supabase
            .from("nurture_email_queue")
            .update({ status: "failed", error: "user_not_found" })
            .eq("id", row.id);
          failed++;
          continue;
        }

        const user = userRow as UserRow;
        const name = user.display_name?.split(" ")[0] ?? "there";

        // Check email preferences (product_updates category)
        const allowed = await canSendEmail(user.email, "product_updates");
        if (!allowed) {
          console.log("[nurture-emails] Skipping unsubscribed user", user.email);
          await supabase
            .from("nurture_email_queue")
            .update({ status: "failed", error: "unsubscribed" })
            .eq("id", row.id);
          failed++;
          continue;
        }

        // Ensure preferences exist and build unsub URLs
        const token = await ensureEmailPreferences(user.email, row.user_id);
        const unsubUrl = getUnsubscribeUrl(token, "product_updates");
        const prefsUrl = getPreferencesUrl(token);

        const day = row.day as 1 | 4 | 9;
        const template = TEMPLATES[day];
        if (!template) {
          console.error("[nurture-emails] Unknown day", day, "for row", row.id);
          await supabase
            .from("nurture_email_queue")
            .update({ status: "failed", error: `unknown_day_${day}` })
            .eq("id", row.id);
          failed++;
          continue;
        }

        const result = await sendEmail({
          to: user.email,
          subject: template.subject,
          html: template.html(name, site, unsubUrl, prefsUrl),
          unsubscribeUrl: unsubUrl,
        });

        if (result.ok) {
          await supabase
            .from("nurture_email_queue")
            .update({ status: "sent", sent_at: new Date().toISOString() })
            .eq("id", row.id);
          sent++;
          console.log(`[nurture-emails] Sent D${day} to ${user.email}`);
        } else {
          const reason = "reason" in result ? result.reason : "unknown";
          await supabase
            .from("nurture_email_queue")
            .update({ status: "failed", error: reason })
            .eq("id", row.id);
          failed++;
          console.error(`[nurture-emails] Failed D${day} to ${user.email}:`, reason);
        }
      } catch (rowErr) {
        const msg = rowErr instanceof Error ? rowErr.message : String(rowErr);
        console.error("[nurture-emails] Row error for", row.id, msg);
        await supabase
          .from("nurture_email_queue")
          .update({ status: "failed", error: msg.slice(0, 200) })
          .eq("id", row.id);
        failed++;
      }
    }

    return NextResponse.json({ ok: true, processed, sent, failed });
  } catch (err) {
    console.error("[nurture-emails] Unexpected error", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
