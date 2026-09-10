// progress-email — the weekly Evaluator Progress Radar email (T0273).
//
// Pure renderer: `renderEvaluatorProgressEmail(payload)` → { subject, html,
// text }. No data access, no `server-only`, so the cron, a preview endpoint
// and the colocated test all render byte-identical output.
//
// Subject:  "Your weekly progress radar — {n} of {m} startups moved"
//       or  "Your weekly progress radar — no movement this week, {k} deadlines ahead"
// Sections: Movers (name · SVI now · Δ · stage) · Deadlines & intakes across
//           your startups (next 5) · New matches · CTAs "Run a re-score (A$1)"
//           / "Run Trust BizReport" → /workspace/evaluations · the
//           EvaluatorReportDisclaimer text (DISCLAIMER_SURFACES.evaluator_report)
//           · unsubscribe (money_radar category — the cron gates on
//           canSendEmail(email, "money_radar") and passes the URL in).
//
// Pricing words are the G12 ones only: Trust BizReport A$3, re-score A$1.
// Never "PhD", never the retired A$5.50 (pinned by the test).

import { DISCLAIMER_SURFACES } from "@/lib/legal/surfaces";
import { formatDelta, progressHeadline, type EvaluatorProgress, type EvaluatorProgressItem } from "./progress-shared";

export interface EvaluatorProgressEmailPayload {
  progress: EvaluatorProgress;
  /** "Sam" — falls back to "there". */
  displayName?: string | null;
  /** From getUnsubscribeUrl(token, "money_radar"). */
  unsubscribeUrl?: string | null;
  /** Defaults to NEXT_PUBLIC_SITE_URL or https://blockid.au. */
  siteUrl?: string | null;
}

export interface RenderedEvaluatorProgressEmail {
  subject: string;
  html: string;
  text: string;
}

export const STAGE_LABELS: Record<number, string> = {
  0: "Pre-idea",
  1: "Idea",
  2: "Validation",
  3: "MVP",
  4: "Early traction",
  5: "Growth",
  6: "Scale",
  7: "Mature",
};

export function stageLabel(stage: number | null): string {
  if (stage == null) return "—";
  return STAGE_LABELS[stage] ?? `Stage ${stage}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function siteUrlOf(p: EvaluatorProgressEmailPayload): string {
  return (p.siteUrl || process.env.NEXT_PUBLIC_SITE_URL || "https://blockid.au").replace(/\/$/, "");
}

function fmtDay(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function daysPhrase(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

function sviText(i: EvaluatorProgressItem): string {
  return i.sviNow == null ? "not scored" : String(Math.round(i.sviNow));
}

function stageText(i: EvaluatorProgressItem): string {
  const now = stageLabel(i.stageNow);
  return i.stageChanged ? `${stageLabel(i.stagePrev)} → ${now}` : now;
}

/** Disclaimer text with the markdown bold markers stripped (email-safe). */
export function evaluatorDisclaimerText(): string {
  return DISCLAIMER_SURFACES.evaluator_report.body_md.replace(/\*\*/g, "");
}

export function renderEvaluatorProgressEmail(payload: EvaluatorProgressEmailPayload): RenderedEvaluatorProgressEmail {
  const p = payload.progress;
  const site = siteUrlOf(payload);
  const workspace = `${site}/workspace/evaluations`;
  const name = (payload.displayName ?? "").trim() || "there";
  const subject = progressHeadline(p);
  const m = p.items.length;
  const unsub = payload.unsubscribeUrl ?? null;
  const disclaimer = evaluatorDisclaimerText();

  // ── Movers ──
  const moversHtml =
    p.movers.length > 0
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;">
  <thead><tr style="text-align:left;color:#64748B;font-size:11px;text-transform:uppercase;letter-spacing:.06em;">
    <th style="padding:6px 8px;border-bottom:1px solid #E2E8F0;">Startup</th>
    <th style="padding:6px 8px;border-bottom:1px solid #E2E8F0;">SVI now</th>
    <th style="padding:6px 8px;border-bottom:1px solid #E2E8F0;">Δ this week</th>
    <th style="padding:6px 8px;border-bottom:1px solid #E2E8F0;">Stage</th>
  </tr></thead>
  <tbody>
${p.movers
  .map((i) => {
    const up = (i.delta ?? 0) > 0;
    return `    <tr>
      <td style="padding:8px;border-bottom:1px solid #F1F5F9;font-weight:600;color:#0F172A;">${escapeHtml(i.name)}${i.newEvidence > 0 ? `<div style="font-weight:400;font-size:12px;color:#64748B;">${i.newEvidence} new evidence item${i.newEvidence === 1 ? "" : "s"}</div>` : ""}</td>
      <td style="padding:8px;border-bottom:1px solid #F1F5F9;color:#0F172A;">${sviText(i)}</td>
      <td style="padding:8px;border-bottom:1px solid #F1F5F9;font-weight:600;color:${up ? "#047857" : "#B91C1C"};">${escapeHtml(formatDelta(i.delta))}</td>
      <td style="padding:8px;border-bottom:1px solid #F1F5F9;color:#334155;">${escapeHtml(stageText(i))}</td>
    </tr>`;
  })
  .join("\n")}
  </tbody></table>`
      : `<p style="margin:0;font-size:14px;color:#475569;">No SVI movement across your ${m} tracked startup${m === 1 ? "" : "s"} this week.${
          p.newEvidence > 0 ? ` ${p.newEvidence} new evidence item${p.newEvidence === 1 ? "" : "s"} landed — a re-score will pick them up.` : ""
        }</p>`;

  // ── Deadlines ──
  const deadlinesHtml =
    p.deadlines.length > 0
      ? `<ul style="margin:0;padding-left:18px;font-size:14px;color:#0F172A;line-height:1.7;">
${p.deadlines
  .map(
    (d) =>
      `  <li><strong>${escapeHtml(d.name)}</strong> — ${escapeHtml(d.startup)} · ${d.refKind === "grant" ? "closes" : "applications close"} ${daysPhrase(d.daysLeft)} (${escapeHtml(fmtDay(d.closesAt))})${
        d.url ? ` · <a href="${escapeHtml(d.url)}" style="color:#4F46E5;">official page</a>` : ""
      }</li>`,
  )
  .join("\n")}
</ul>`
      : `<p style="margin:0;font-size:14px;color:#475569;">No dated grant or program deadlines ahead for the startups you track.</p>`;

  // ── New matches ──
  const matchesHtml =
    p.newMatches > 0
      ? `<p style="margin:0;font-size:14px;color:#0F172A;"><strong>${p.newMatches}</strong> new grant / program match${p.newMatches === 1 ? "" : "es"} this week across ${escapeHtml(
          p.items
            .filter((i) => i.money.newMatches > 0)
            .map((i) => `${i.name} (${i.money.newMatches})`)
            .join(", "),
        )}.</p>`
      : `<p style="margin:0;font-size:14px;color:#475569;">No new grant or program matches this week.</p>`;

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head><body style="margin:0;padding:24px;background:#F1F5F9;color:#0F172A;font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;"><div style="max-width:600px;margin:0 auto;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:12px;padding:32px;">
  <p style="margin:0 0 8px 0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#64748B;">BlockID.au · Progress Radar</p>
  <h1 style="margin:0 0 6px 0;font-size:20px;line-height:1.3;">${escapeHtml(subject.replace(/^Your weekly progress radar — /, "This week: "))}</h1>
  <p style="margin:0 0 20px 0;font-size:14px;color:#475569;">Hi ${escapeHtml(name)} — the same 8-dimension rubric across the ${m} startup${m === 1 ? "" : "s"} you evaluate, and what changed since last week.</p>

  <h2 style="margin:0 0 8px 0;font-size:14px;text-transform:uppercase;letter-spacing:.06em;color:#64748B;">Movers</h2>
  ${moversHtml}

  <h2 style="margin:24px 0 8px 0;font-size:14px;text-transform:uppercase;letter-spacing:.06em;color:#64748B;">Deadlines &amp; intakes across your startups</h2>
  ${deadlinesHtml}

  <h2 style="margin:24px 0 8px 0;font-size:14px;text-transform:uppercase;letter-spacing:.06em;color:#64748B;">New matches</h2>
  ${matchesHtml}

  <p style="margin:28px 0 8px 0;">
    <a href="${escapeHtml(workspace)}" style="display:inline-block;background:#4F46E5;color:#FFFFFF;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px;">Run a re-score (A$1)</a>
    <a href="${escapeHtml(workspace)}" style="display:inline-block;margin-left:8px;border:1px solid #C7D2FE;color:#4338CA;text-decoration:none;font-weight:600;padding:11px 20px;border-radius:10px;">Run Trust BizReport</a>
  </p>
  <p style="margin:0 0 24px 0;font-size:12px;color:#64748B;">A re-score refreshes the SVI over the evidence the startup has now (A$1). A full Trust BizReport is A$3 or one of your included reports.</p>

  <p style="margin:0 0 12px 0;font-size:11px;line-height:1.6;color:#64748B;border-top:1px solid #E2E8F0;padding-top:12px;">${escapeHtml(disclaimer)}</p>
  <p style="margin:0;font-size:11px;color:#94A3B8;">You receive this because Progress Radar is part of your evaluator plan.${
    unsub ? ` <a href="${escapeHtml(unsub)}" style="color:#64748B;">Unsubscribe from Progress Radar emails</a>` : ""
  }</p>
</div></body></html>`;

  const textLines: string[] = [
    subject,
    "",
    `Hi ${name} — what changed across the ${m} startup${m === 1 ? "" : "s"} you evaluate.`,
    "",
    "MOVERS",
    ...(p.movers.length > 0
      ? p.movers.map((i) => `- ${i.name} · SVI ${sviText(i)} · ${formatDelta(i.delta)} · ${stageText(i)}`)
      : ["- No SVI movement this week."]),
    "",
    "DEADLINES & INTAKES",
    ...(p.deadlines.length > 0
      ? p.deadlines.map((d) => `- ${d.name} — ${d.startup} · ${daysPhrase(d.daysLeft)} (${d.closesAt})${d.url ? ` · ${d.url}` : ""}`)
      : ["- None ahead."]),
    "",
    "NEW MATCHES",
    `- ${p.newMatches} this week`,
    "",
    `Run a re-score (A$1) or a Trust BizReport: ${workspace}`,
    "",
    disclaimer,
    ...(unsub ? ["", `Unsubscribe from Progress Radar emails: ${unsub}`] : []),
  ];

  return { subject, html, text: textLines.join("\n") };
}
