// Wave 31c — Investor lead drip email templates.
//
// Three pure render functions. Each returns { subject, html, text } — the
// caller (route handler / cron) is responsible for sendEmail() and audit.
//
// Compliance: template copy contains no real company names. `startup_name`
// is a runtime placeholder pulled from svi_accounts / projects at call time.

export interface DripContext {
  startupName: string;
  sector?: string | null;
  stage?: string | null;
  shareUrl: string; // /tbr/{token}
  unsubscribeUrl: string;
  investorName?: string | null;
}

export interface Step2Context extends DripContext {
  sviCurrent: number;
  sviPrevious: number;
  sviDelta: number; // positive or negative
}

export interface Step3Context extends DripContext {
  founderContactEmail?: string | null;
  feedbackUrl: string; // link back to /tbr/{token} with ?feedback=1
}

export interface RenderedDrip {
  subject: string;
  html: string;
  text: string;
}

const BRAND_PRIMARY = "#4338ca";
const BRAND_ACCENT = "#0f766e";
const TEXT_MUTED = "#475569";
const BORDER = "#e2e8f0";

// ---------- Step 1: T+0 acknowledgement ---------------------------------------

export function renderStep1(ctx: DripContext): RenderedDrip {
  const greeting = ctx.investorName ? `Hi ${escapeHtml(ctx.investorName)},` : "Hi,";
  const subject = `Thanks for your interest in ${ctx.startupName}`;

  const meta: string[] = [];
  if (ctx.sector) meta.push(`Sector: <strong>${escapeHtml(ctx.sector)}</strong>`);
  if (ctx.stage) meta.push(`Stage: <strong>${escapeHtml(ctx.stage)}</strong>`);
  const metaHtml = meta.length
    ? `<p style="margin:0 0 16px;color:${TEXT_MUTED};font-size:14px">${meta.join(" · ")}</p>`
    : "";

  const html = shell(
    `<p style="margin:0 0 6px;font-size:11px;font-weight:700;color:${BRAND_PRIMARY};text-transform:uppercase;letter-spacing:0.16em">Investor update</p>
     <h1 style="margin:8px 0 12px;font-size:22px;color:#0f172a">Thanks for reaching out about ${escapeHtml(ctx.startupName)}</h1>
     <p style="margin:0 0 12px;color:#0f172a;font-size:14px;line-height:1.55">${greeting}</p>
     <p style="margin:0 0 16px;color:#0f172a;font-size:14px;line-height:1.55">We've received your interest in <strong>${escapeHtml(ctx.startupName)}</strong>. The founder has been notified and will follow up within <strong>48 hours</strong>.</p>
     ${metaHtml}
     <p style="margin:0 0 20px;color:#0f172a;font-size:14px;line-height:1.55">In the meantime, the shared Trusted Business Report link below stays live — you can revisit it any time.</p>
     <p style="margin:0 0 24px"><a href="${escapeAttr(ctx.shareUrl)}" style="display:inline-block;padding:10px 18px;background:${BRAND_PRIMARY};color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600">Open the report</a></p>
     <p style="margin:24px 0 0;color:#0f172a;font-size:14px;line-height:1.55">— The BlockID team</p>`,
    ctx.unsubscribeUrl,
  );

  const text = [
    greeting.replace(/,$/, ",").replace(/<[^>]+>/g, ""),
    "",
    `Thanks for reaching out about ${ctx.startupName}. The founder has been notified and will follow up within 48 hours.`,
    "",
    ...(ctx.sector ? [`Sector: ${ctx.sector}`] : []),
    ...(ctx.stage ? [`Stage: ${ctx.stage}`] : []),
    "",
    `Report: ${ctx.shareUrl}`,
    "",
    "— The BlockID team",
    "",
    `Unsubscribe from investor updates: ${ctx.unsubscribeUrl}`,
  ].join("\n");

  return { subject, html, text };
}

// ---------- Step 2: T+2 days, SVI delta (warm+ only) --------------------------

export function renderStep2(ctx: Step2Context): RenderedDrip {
  const subject = `Founder update: ${ctx.startupName}`;
  const greeting = ctx.investorName ? `Hi ${escapeHtml(ctx.investorName)},` : "Hi,";

  const sign = ctx.sviDelta > 0 ? "+" : "";
  const deltaColour = ctx.sviDelta > 0 ? "#047857" : ctx.sviDelta < 0 ? "#be123c" : TEXT_MUTED;
  const arrow = ctx.sviDelta > 0 ? "▲" : ctx.sviDelta < 0 ? "▼" : "—";

  const html = shell(
    `<p style="margin:0 0 6px;font-size:11px;font-weight:700;color:${BRAND_ACCENT};text-transform:uppercase;letter-spacing:0.16em">Progress since you last looked</p>
     <h1 style="margin:8px 0 12px;font-size:22px;color:#0f172a">${escapeHtml(ctx.startupName)} · updated Startup Value Index</h1>
     <p style="margin:0 0 20px;color:#0f172a;font-size:14px;line-height:1.55">${greeting}</p>
     <p style="margin:0 0 16px;color:#0f172a;font-size:14px;line-height:1.55">Since you registered interest in <strong>${escapeHtml(ctx.startupName)}</strong>, their Startup Value Index has moved:</p>
     <div style="padding:16px;background:#f8fafc;border:1px solid ${BORDER};border-radius:8px;margin:0 0 20px">
        <p style="margin:0;font-size:32px;font-weight:700;color:${deltaColour}">${ctx.sviCurrent}<span style="font-size:14px;color:${TEXT_MUTED};font-weight:400"> /100</span></p>
        <p style="margin:6px 0 0;font-size:13px;font-weight:600;color:${deltaColour}">${arrow} ${sign}${ctx.sviDelta} pts (was ${ctx.sviPrevious})</p>
     </div>
     <p style="margin:0 0 20px;color:#0f172a;font-size:14px;line-height:1.55">Re-open the report to see what changed — new evidence, milestones, or dimension scores may inform your next step.</p>
     <p style="margin:0 0 24px"><a href="${escapeAttr(ctx.shareUrl)}" style="display:inline-block;padding:10px 18px;background:${BRAND_ACCENT};color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600">Re-open the report</a></p>
     <p style="margin:24px 0 0;color:#0f172a;font-size:14px;line-height:1.55">— The BlockID team</p>`,
    ctx.unsubscribeUrl,
  );

  const text = [
    greeting.replace(/<[^>]+>/g, ""),
    "",
    `${ctx.startupName} — Startup Value Index update.`,
    `Current: ${ctx.sviCurrent}/100`,
    `Change:  ${sign}${ctx.sviDelta} pts (was ${ctx.sviPrevious})`,
    "",
    `Re-open the report: ${ctx.shareUrl}`,
    "",
    "— The BlockID team",
    "",
    `Unsubscribe from investor updates: ${ctx.unsubscribeUrl}`,
  ].join("\n");

  return { subject, html, text };
}

// ---------- Step 3: T+7 days, soft nudge + feedback ---------------------------

export function renderStep3(ctx: Step3Context): RenderedDrip {
  const subject = `How to move forward with ${ctx.startupName}`;
  const greeting = ctx.investorName ? `Hi ${escapeHtml(ctx.investorName)},` : "Hi,";

  const contactBlock = ctx.founderContactEmail
    ? `<p style="margin:0 0 20px;color:#0f172a;font-size:14px;line-height:1.55">To take the next step, reply directly to the founder at <a href="mailto:${escapeAttr(ctx.founderContactEmail)}" style="color:${BRAND_PRIMARY};font-weight:600">${escapeHtml(ctx.founderContactEmail)}</a> to book a call.</p>`
    : `<p style="margin:0 0 20px;color:#0f172a;font-size:14px;line-height:1.55">To take the next step, reply to this email — we'll route it to the founder to book a call.</p>`;

  const feedbackRow = (label: string, value: string) =>
    `<a href="${escapeAttr(ctx.feedbackUrl)}&r=${encodeURIComponent(value)}" style="display:inline-block;margin:0 6px 8px 0;padding:8px 14px;background:#f1f5f9;color:#0f172a;border:1px solid ${BORDER};border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">${escapeHtml(label)}</a>`;

  const html = shell(
    `<p style="margin:0 0 6px;font-size:11px;font-weight:700;color:${BRAND_PRIMARY};text-transform:uppercase;letter-spacing:0.16em">Next steps</p>
     <h1 style="margin:8px 0 12px;font-size:22px;color:#0f172a">Ready to move forward with ${escapeHtml(ctx.startupName)}?</h1>
     <p style="margin:0 0 20px;color:#0f172a;font-size:14px;line-height:1.55">${greeting}</p>
     <p style="margin:0 0 16px;color:#0f172a;font-size:14px;line-height:1.55">It's been a week since you registered interest in <strong>${escapeHtml(ctx.startupName)}</strong>. The shared Trusted Business Report link stays live — you can revisit it any time.</p>
     ${contactBlock}
     <p style="margin:0 0 24px"><a href="${escapeAttr(ctx.shareUrl)}" style="display:inline-block;padding:10px 18px;background:${BRAND_PRIMARY};color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600">Re-open the report</a></p>
     <div style="margin:24px 0 0;padding:16px;background:#f8fafc;border:1px solid ${BORDER};border-radius:8px">
        <p style="margin:0 0 10px;font-size:13px;font-weight:600;color:#0f172a">Quick feedback — where are you at?</p>
        <div>${feedbackRow("Still considering", "considering")}${feedbackRow("Not moving forward", "declined")}${feedbackRow("Already invested", "invested")}</div>
     </div>
     <p style="margin:24px 0 0;color:#0f172a;font-size:14px;line-height:1.55">— The BlockID team</p>`,
    ctx.unsubscribeUrl,
  );

  const text = [
    greeting.replace(/<[^>]+>/g, ""),
    "",
    `It's been a week since you registered interest in ${ctx.startupName}.`,
    "",
    ctx.founderContactEmail
      ? `To take the next step, email the founder at ${ctx.founderContactEmail}.`
      : "To take the next step, reply to this email — we'll route it to the founder.",
    "",
    `Re-open the report: ${ctx.shareUrl}`,
    "",
    "Quick feedback:",
    `  Still considering: ${ctx.feedbackUrl}&r=considering`,
    `  Not moving forward: ${ctx.feedbackUrl}&r=declined`,
    `  Already invested:   ${ctx.feedbackUrl}&r=invested`,
    "",
    "— The BlockID team",
    "",
    `Unsubscribe from investor updates: ${ctx.unsubscribeUrl}`,
  ].join("\n");

  return { subject, html, text };
}

// ---------- Shared helpers ----------------------------------------------------

function shell(inner: string, unsubscribeUrl: string): string {
  return `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;background:#f8fafc;padding:24px;margin:0">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid ${BORDER};border-radius:12px;overflow:hidden">
    <div style="padding:28px 28px 20px">${inner}</div>
    <div style="padding:14px 28px;border-top:1px solid ${BORDER};background:#f8fafc;font-size:11px;color:#64748b;line-height:1.5">
      You're receiving this because you registered interest via a shared BlockID.au Trusted Business Report.
      <a href="${escapeAttr(unsubscribeUrl)}" style="color:#64748b;text-decoration:underline">Unsubscribe from investor updates</a>.
    </div>
  </div>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
