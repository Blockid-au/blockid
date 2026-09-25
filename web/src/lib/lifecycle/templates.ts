// G34-BT4 — copy for the lifecycle flows (plan §9.2, EM12–EM20).
//
// Server-only (the unsubscribe URL helper reads email-preferences). Every
// body is built from the recipient's own data captured at enqueue time
// (lib/lifecycle/payload.ts) — no generic "tips", one call to action.
//
//   * `renderScoreUpdated` is TRANSACTIONAL (T): the re-score the recipient
//     ran, old → new, which dimension moved and the evidence behind it.
//     Factual only — no price, plan, credit offer or cross-sell link; the
//     EM08 lint (lib/email-transactional-lint.test.ts) pins that.
//   * Everything else is COMMERCIAL (C): it passes consent, suppression, the
//     global frequency cap and quiet hours in the drip worker and carries the
//     RFC 8058 one-click List-Unsubscribe header (lib/email-core.ts). Any
//     price is read from the catalogue and every buy link goes to the
//     review-before-pay page, never to Stripe (G25-D).
//
// Voice matches lib/email-drip.ts: direct, quiet, no exclamation marks.

import "server-only";
import { acnAbnLine } from "@/lib/site/legal-entity";
import { getPreferencesUrl, getUnsubscribeUrl, type EmailCategory } from "@/lib/email-preferences";
import { SVI_ANALYSIS_CREDITS } from "@/lib/credits-public";
import { CREDIT_PACKS } from "@/lib/credit-packs";
import { PLANS_V2, formatAud } from "@/lib/plans-v2";
import { GENERATED_PLANS_BY_ID } from "@/config/pricing/plans.generated";
import { checkoutReviewHref } from "@/lib/billing/checkout-review";
import { LIFECYCLE_META, type LifecycleCampaign } from "./campaigns";
import type { LifecyclePayload } from "./payload";

export interface LifecycleRenderInput {
  lifecycle?: LifecyclePayload;
  project_id?: string | null;
  startup?: string | null;
  unsubscribe_token?: string | null;
}

export interface RenderedLifecycleEmail {
  subject: string;
  html: string;
  text: string;
}

// ── Layout ───────────────────────────────────────────────────────────────────

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://blockid.au").replace(/\/$/, "");
}

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function unsubscribeUrl(email: string, token: string | null | undefined, category: EmailCategory): string {
  if (token) return getUnsubscribeUrl(token, category);
  return `${siteUrl()}/unsubscribe?email=${encodeURIComponent(email)}`;
}

function preferencesUrl(email: string, token: string | null | undefined): string {
  if (token) return getPreferencesUrl(token);
  return `${siteUrl()}/unsubscribe?email=${encodeURIComponent(email)}`;
}

interface FooterOpts {
  reason: string;
  category: EmailCategory;
  token?: string | null;
  /** T-class: "Email preferences" instead of "Unsubscribe". */
  transactional?: boolean;
}

function footerHtml(email: string, o: FooterOpts): string {
  const href = o.transactional ? preferencesUrl(email, o.token) : unsubscribeUrl(email, o.token, o.category);
  const label = o.transactional ? "Email preferences" : "Unsubscribe";
  return `
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0 16px 0;">
    <p style="margin:0 0 4px 0;color:#0b0f1a;font-size:12px;line-height:1.6;font-weight:600;">BlockID &middot; Startup Value Index</p>
    <p style="margin:0 0 4px 0;color:#6b7280;font-size:12px;line-height:1.6;">${acnAbnLine().replace(/ · /g, " &middot; ")}</p>
    <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.6;">${escapeHtml(o.reason)} <a href="${escapeHtml(href)}" style="color:#6b7280;text-decoration:underline;">${label}</a>.</p>`;
}

function footerText(email: string, o: FooterOpts): string {
  const href = o.transactional ? preferencesUrl(email, o.token) : unsubscribeUrl(email, o.token, o.category);
  return `\n\n—\nBlockID · Startup Value Index\n${acnAbnLine()}\n${o.reason}\n${o.transactional ? "Email preferences" : "Unsubscribe"}: ${href}`;
}

function shell(kicker: string, heading: string, inner: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BlockID · Startup Value Index</title></head><body style="margin:0;padding:0;background:#f7f8fa;color:#0b0f1a;font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f8fa;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:32px;">
        <tr><td style="font-size:15px;color:#0b0f1a;line-height:1.6;">
    <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#1B2A5E;font-weight:600;">BlockID &middot; ${escapeHtml(kicker)}</p>
    <h1 style="margin:0 0 12px 0;font-size:20px;font-weight:600;color:#0b0f1a;">${escapeHtml(heading)}</h1>
    ${inner}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function cta(href: string, label: string): string {
  return `<p style="margin:24px 0;text-align:left;"><a href="${escapeHtml(href)}" style="display:inline-block;background:#1B2A5E;color:#ffffff;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;">${escapeHtml(label)}</a></p>`;
}

function list(items: string[]): string {
  if (items.length === 0) return "";
  return `<ol style="padding-left:20px;margin:0 0 16px 0;">${items.map((i) => `<li style="margin-bottom:6px;">${escapeHtml(i)}</li>`).join("")}</ol>`;
}

function reportUrl(projectId?: string | null): string {
  const base = `${siteUrl()}/workspace/reports/business`;
  return projectId ? `${base}?pid=${encodeURIComponent(projectId)}` : base;
}

function startupName(p: LifecycleRenderInput): string {
  return p.startup?.trim() || "your startup";
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

function round(n: unknown): number | null {
  return typeof n === "number" && Number.isFinite(n) ? Math.round(n) : null;
}

function auDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "Australia/Sydney" });
}

// ── EM12 score updated (T) ───────────────────────────────────────────────────

const SCORE_REASON = "Sent because a re-score of your startup finished on BlockID.au.";

export function renderScoreUpdated(email: string, p: LifecycleRenderInput): RenderedLifecycleEmail {
  const s = p.lifecycle?.score;
  const before = round(s?.previous_svi) ?? 0;
  const after = round(s?.new_svi) ?? 0;
  const delta = after - before;
  const name = startupName(p);
  const when = auDate(s?.scored_at);
  const changes = (s?.changes ?? []).slice(0, 8);
  const url = reportUrl(p.project_id);
  const foot = { reason: SCORE_REASON, category: "svi_alerts" as const, token: p.unsubscribe_token, transactional: true };

  const subject = `Your Startup Value Index was re-scored: ${before} → ${after}`;
  const lead = `${name} was re-scored${when ? ` on ${when}` : ""}. Startup Value Index: ${before} → ${after} (${delta === 0 ? "no change" : signed(delta)}).`;
  const changeLines = changes.map(
    (c) => `${c.label}: ${Math.round(c.before)} → ${Math.round(c.after)}${c.evidence.length ? ` — evidence on file: ${c.evidence.slice(0, 3).join("; ")}` : ""}`,
  );
  const noDimLine =
    "No dimension score moved. The total changed through the confidence and verification adjustments applied to the whole score.";
  const html = shell(
    "Score updated",
    `${name}: ${before} → ${after}`,
    `<p>${escapeHtml(lead)}</p>
    ${changes.length ? `<p style="margin:16px 0 8px 0;font-weight:600;">What moved</p>${list(changeLines)}` : delta !== 0 ? `<p>${escapeHtml(noDimLine)}</p>` : ""}
    ${cta(url, "Open your report")}
    <p style="color:#6b7280;font-size:13px;">Every point in the report is traced to the input or evidence that produced it under "How this score was built".</p>
    ${footerHtml(email, foot)}`,
  );
  const text = [
    lead,
    ...(changes.length ? ["", "What moved:", ...changeLines.map((l, i) => `${i + 1}. ${l}`)] : delta !== 0 ? ["", noDimLine] : []),
    "",
    `Open your report: ${url}`,
  ].join("\n");
  return { subject, html, text: `${text}${footerText(email, foot)}` };
}

// ── EM14 evidence gap (C) ────────────────────────────────────────────────────

const PRODUCT_REASON = "Sent because you have a Startup Value Index report on BlockID.au.";

function renderEvidenceGap(email: string, p: LifecycleRenderInput, followUp: boolean): RenderedLifecycleEmail {
  const g = p.lifecycle?.gap;
  const title = g?.dimension_title ?? "your weakest dimension";
  const short = g?.short_label ?? title;
  const lead = g?.lead_agent ?? null;
  const score = round(g?.score);
  const missing = (g?.missing ?? []).slice(0, 3);
  const url = `${siteUrl()}${g?.cta_path ?? "/workspace/evidence"}`;
  const foot = { reason: PRODUCT_REASON, category: LIFECYCLE_META.evidence_gap_1.category, token: p.unsubscribe_token };
  const rung = g?.confidence_to ? ` One item lifts its confidence from "nothing on file" to "${g.confidence_to}".` : "";

  const subject = followUp
    ? `Still nothing on file for ${short} — one upload moves it`
    : `${short} is your lowest-scored dimension — no evidence on file yet`;
  const intro = followUp
    ? `A week ago your report showed ${title}${score !== null ? ` at ${score}/100` : ""} with no evidence behind it. That is still the case, and it is still the fastest place to lift your score.${rung}`
    : `Your report scored ${title}${score !== null ? ` at ${score}/100` : ""}, the lowest of your eight dimensions, and there is no evidence on file for it yet.${rung}`;
  const leadLine = lead
    ? `The ${lead} agent leads this dimension. The items it weighs most${g?.missing_count ? ` (${Math.min(3, g.missing_count)} of ${g.missing_count} missing)` : ""}:`
    : "The items that count most here:";
  const html = shell(
    followUp ? "Evidence · follow-up" : "Evidence",
    followUp ? `${short}: still no evidence` : `Back ${short} with evidence`,
    `<p>${escapeHtml(intro)}</p>
    ${missing.length ? `<p style="margin:16px 0 8px 0;font-weight:600;">${escapeHtml(leadLine)}</p>${list(missing)}` : ""}
    ${cta(url, `Add ${short} evidence`)}
    <p style="color:#6b7280;font-size:13px;">A link, a screenshot or a PDF is enough to start. Adding evidence is free.</p>
    ${footerHtml(email, foot)}`,
  );
  const text = [
    intro,
    ...(missing.length ? ["", leadLine, ...missing.map((m, i) => `${i + 1}. ${m}`)] : []),
    "",
    `Add ${short} evidence: ${url}`,
    "A link, a screenshot or a PDF is enough to start. Adding evidence is free.",
  ].join("\n");
  return { subject, html, text: `${text}${footerText(email, foot)}` };
}

// ── EM13 onboarding abandoned (C) ────────────────────────────────────────────

const ACCOUNT_REASON = "Sent because you started setting up a BlockID.au account.";

function renderIntakeAbandoned(email: string, p: LifecycleRenderInput, followUp: boolean): RenderedLifecycleEmail {
  const d = p.lifecycle?.intake;
  const total = d?.steps_total && d.steps_total > 0 ? d.steps_total : 3;
  const done = Math.max(0, Math.min(total - 1, d?.steps_done ?? 1));
  const pct = Math.round((done / total) * 100);
  const left = total - done;
  const next = d?.next_step_label ?? "the next step";
  const url = `${siteUrl()}/onboarding`;
  const foot = { reason: ACCOUNT_REASON, category: LIFECYCLE_META.intake_abandoned_1.category, token: p.unsubscribe_token };

  const subject =
    done === 0
      ? `Your BlockID setup is waiting — ${total} short steps`
      : followUp
        ? `Your BlockID setup is still ${pct}% done`
        : `Your BlockID setup is ${pct}% done — ${left} step${left === 1 ? "" : "s"} left`;
  const intro =
    done === 0
      ? `You opened BlockID setup but have not finished the first of ${total} steps yet.`
      : followUp
        ? `Your setup is still at ${done} of ${total} steps. Everything you entered is saved; you continue where you stopped.`
        : `You finished ${done} of ${total} setup steps. Everything you entered is saved.`;
  const nextLine = `Next: ${next}. It takes about two minutes, and the step after it runs your first analysis.`;
  const html = shell(
    followUp ? "Setup · follow-up" : "Setup",
    `${done} of ${total} steps done`,
    `<p>${escapeHtml(intro)}</p><p>${escapeHtml(nextLine)}</p>
    ${cta(url, "Continue setup")}
    ${footerHtml(email, foot)}`,
  );
  const text = `${intro}\n\n${nextLine}\n\nContinue setup: ${url}`;
  return { subject, html, text: `${text}${footerText(email, foot)}` };
}

// ── EM15 re-run prompt (C) ───────────────────────────────────────────────────

/** "0.5 credits" — read from the same constant the analysis debit uses. */
export function rerunCreditLabel(): string {
  const n: number = SVI_ANALYSIS_CREDITS;
  return `${n} credit${n === 1 ? "" : "s"}`;
}

function renderRerunPrompt(email: string, p: LifecycleRenderInput): RenderedLifecycleEmail {
  const d = p.lifecycle?.rerun;
  const n = Math.max(1, d?.new_evidence_count ?? 1);
  const since = auDate(d?.last_scored_at);
  const labels = (d?.evidence_labels ?? []).slice(0, 3);
  const cost = rerunCreditLabel();
  const url = `${siteUrl()}/analyze`;
  const foot = { reason: PRODUCT_REASON, category: LIFECYCLE_META.rerun_prompt.category, token: p.unsubscribe_token };

  const subject = `New evidence since your last analysis — re-run costs ${cost}`;
  const intro = `You added ${n} evidence item${n === 1 ? "" : "s"}${since ? ` since your last full analysis on ${since}` : " since your last full analysis"}. A re-run reads ${n === 1 ? "it" : "them"} into every chapter of the report, not only the score.`;
  const costLine = `A re-run costs ${cost}. The exact cost is shown on screen and nothing is charged until you confirm.`;
  const html = shell(
    "Re-run",
    "New data since your last score",
    `<p>${escapeHtml(intro)}</p>
    ${labels.length ? `<p style="margin:16px 0 8px 0;font-weight:600;">Added since then:</p>${list(labels)}` : ""}
    <p><strong>${escapeHtml(costLine)}</strong></p>
    ${cta(url, "Review and re-run")}
    ${footerHtml(email, foot)}`,
  );
  const text = [intro, ...(labels.length ? ["", "Added since then:", ...labels.map((l, i) => `${i + 1}. ${l}`)] : []), "", costLine, "", `Review and re-run: ${url}`].join("\n");
  return { subject, html, text: `${text}${footerText(email, foot)}` };
}

// ── EM16 free quota used (C) ─────────────────────────────────────────────────

function renderFreeQuotaUsed(email: string, p: LifecycleRenderInput): RenderedLifecycleEmail {
  const used = p.lifecycle?.quota?.reports_used ?? 2;
  const starter = PLANS_V2.find((pl) => pl.id === "founder_starter");
  const starterPrice = `${formatAud(starter?.monthly_aud ?? null)}/mo`;
  const starterCredits = GENERATED_PLANS_BY_ID["founder_starter"]?.usage_limits?.monthly_credits ?? 0;
  const pack = CREDIT_PACKS[0];
  const packAnalyses = pack ? Math.floor(pack.credits / SVI_ANALYSIS_CREDITS) : 0;
  const planUrl = `${siteUrl()}${checkoutReviewHref({ plan: "founder_starter", entry: "email" })}`;
  const packUrl = pack ? `${siteUrl()}${checkoutReviewHref({ pack: pack.credits, entry: "email" })}` : planUrl;
  const foot = { reason: PRODUCT_REASON, category: LIFECYCLE_META.free_quota_used.category, token: p.unsubscribe_token };

  const subject = `You have used your ${used} free reports — what unlocks next`;
  const intro = `Both free reports for this address have been delivered. Your reports stay in your account; new analyses now run on credits.`;
  const options = [
    ...(pack ? [`A credit pack: ${pack.credits} credits for ${formatAud(pack.price)} — ${packAnalyses} more analyses at ${rerunCreditLabel()} each. Credits do not expire with a plan change.`] : []),
    ...(starter ? [`The Founder plan at ${starterPrice}: your score tracked over time${starterCredits ? ` with ${starterCredits} credits a month` : ""}, a data room and a live investor link. Cancel any time.`] : []),
  ];
  const reviewLine = "Both links open a review page with the full price and GST. Nothing is charged until you press Pay.";
  const html = shell(
    "Free reports",
    "Your free reports are used",
    `<p>${escapeHtml(intro)}</p>${list(options)}
    ${cta(planUrl, "Review the Founder plan")}
    <p style="color:#6b7280;font-size:13px;">Prefer to pay per analysis? <a href="${escapeHtml(packUrl)}" style="color:#1B2A5E;">Review the credit pack</a>. ${escapeHtml(reviewLine)}</p>
    ${footerHtml(email, foot)}`,
  );
  const text = [intro, "", ...options.map((o, i) => `${i + 1}. ${o}`), "", `Review the Founder plan: ${planUrl}`, `Review the credit pack: ${packUrl}`, reviewLine].join("\n");
  return { subject, html, text: `${text}${footerText(email, foot)}` };
}

// ── EM19 monthly digest (C) ──────────────────────────────────────────────────

const DIGEST_REASON = "Sent because you get the BlockID monthly digest.";

function renderMonthlyDigest(email: string, p: LifecycleRenderInput): RenderedLifecycleEmail {
  const d = p.lifecycle?.digest;
  const period = d?.period_label ?? "This month";
  const cur = round(d?.svi_current);
  const prev = round(d?.svi_previous);
  const delta = cur !== null && prev !== null ? cur - prev : null;
  const name = startupName(p);
  const url = reportUrl(p.project_id);
  const foot = { reason: DIGEST_REASON, category: LIFECYCLE_META.monthly_digest.category, token: p.unsubscribe_token };

  const scoreLine =
    cur === null
      ? `${name} has no score yet. Your first analysis sets the baseline every later month is measured against.`
      : prev === null
        ? `Startup Value Index: ${cur}.`
        : `Startup Value Index: ${prev} → ${cur} (${delta === 0 ? "no change" : signed(delta ?? 0)}).`;
  const activity = `Report views: ${d?.views ?? 0}. Investor leads: ${d?.leads ?? 0}.`;
  const quietLine = d?.quiet ? "A quiet month — no score move, views or leads. The three gaps below are what would move it." : null;
  const peer =
    d?.percentile !== null && d?.percentile !== undefined && (d.cohort_n ?? 0) >= 10
      ? `Ahead of ${Math.round(d.percentile)}% of ${d.stage_label ? `${d.stage_label}-stage ` : ""}startups on BlockID (${d.cohort_n} in the cohort).`
      : null;
  const gaps = (d?.missing_top3 ?? []).slice(0, 3);
  const subject = `${period} on BlockID: ${cur === null ? "no score yet" : delta === null ? `SVI ${cur}` : `SVI ${cur} (${delta === 0 ? "no change" : signed(delta)})`}`;
  const html = shell(
    `Monthly digest · ${period}`,
    `${name} in ${period}`,
    `<p><strong>${escapeHtml(scoreLine)}</strong></p>
    <p>${escapeHtml(activity)}</p>
    ${quietLine ? `<p>${escapeHtml(quietLine)}</p>` : ""}
    ${peer ? `<p>${escapeHtml(peer)}</p>` : ""}
    ${gaps.length ? `<p style="margin:16px 0 8px 0;font-weight:600;">Top ${gaps.length} missing</p><ol style="padding-left:20px;margin:0 0 16px 0;">${gaps.map((g) => `<li style="margin-bottom:6px;"><a href="${escapeHtml(g.cta_url)}" style="color:#1B2A5E;">${escapeHtml(g.title)}</a></li>`).join("")}</ol>` : ""}
    ${cta(url, "Open your report")}
    ${footerHtml(email, foot)}`,
  );
  const text = [
    scoreLine,
    activity,
    ...(quietLine ? [quietLine] : []),
    ...(peer ? [peer] : []),
    ...(gaps.length ? ["", `Top ${gaps.length} missing:`, ...gaps.map((g, i) => `${i + 1}. ${g.title} — ${g.cta_url}`)] : []),
    "",
    `Open your report: ${url}`,
  ].join("\n");
  return { subject, html, text: `${text}${footerText(email, foot)}` };
}

// ── EM20 sunset (C) ──────────────────────────────────────────────────────────

/** Days the sunset question waits for a sign-in or a saved preference before commercial mail stops. */
export const SUNSET_GRACE_DAYS = 30;

function renderSunsetCheck(email: string, p: LifecycleRenderInput): RenderedLifecycleEmail {
  const d = p.lifecycle?.sunset;
  const since = auDate(d?.last_seen_at);
  const keepUrl = preferencesUrl(email, p.unsubscribe_token);
  const stopUrl = p.unsubscribe_token ? getUnsubscribeUrl(p.unsubscribe_token) : `${siteUrl()}/unsubscribe?email=${encodeURIComponent(email)}`;
  const foot = { reason: PRODUCT_REASON, category: LIFECYCLE_META.sunset_check.category, token: p.unsubscribe_token };

  const subject = "Keep getting BlockID progress e-mails?";
  const intro = since
    ? `We have not seen you sign in since ${since}, so we are checking before we send anything else.`
    : `We have not seen you sign in for ${d?.days_inactive ?? 90} days, so we are checking before we send anything else.`;
  const keep = `To keep them: sign in, or open your e-mail settings and press Save.`;
  const stop = `If we hear nothing in ${SUNSET_GRACE_DAYS} days we stop progress reminders, digests and offers. Receipts and security notices are not affected, and your account and reports stay as they are.`;
  const html = shell(
    "Keep or stop",
    "Keep or stop?",
    `<p>${escapeHtml(intro)}</p><p>${escapeHtml(keep)}</p><p>${escapeHtml(stop)}</p>
    ${cta(keepUrl, "Keep my e-mails")}
    <p style="color:#6b7280;font-size:13px;">Or <a href="${escapeHtml(stopUrl)}" style="color:#1B2A5E;">stop them now</a>.</p>
    ${footerHtml(email, foot)}`,
  );
  const text = `${intro}\n\n${keep}\n\n${stop}\n\nKeep my e-mails: ${keepUrl}\nStop them now: ${stopUrl}`;
  return { subject, html, text: `${text}${footerText(email, foot)}` };
}

// ── Router ───────────────────────────────────────────────────────────────────

export function renderLifecycleEmail(campaign: LifecycleCampaign, email: string, p: LifecycleRenderInput): RenderedLifecycleEmail {
  switch (campaign) {
    case "score_updated":
      return renderScoreUpdated(email, p);
    case "evidence_gap_1":
      return renderEvidenceGap(email, p, false);
    case "evidence_gap_2":
      return renderEvidenceGap(email, p, true);
    case "intake_abandoned_1":
      return renderIntakeAbandoned(email, p, false);
    case "intake_abandoned_2":
      return renderIntakeAbandoned(email, p, true);
    case "rerun_prompt":
      return renderRerunPrompt(email, p);
    case "free_quota_used":
      return renderFreeQuotaUsed(email, p);
    case "monthly_digest":
      return renderMonthlyDigest(email, p);
    case "sunset_check":
      return renderSunsetCheck(email, p);
  }
}
