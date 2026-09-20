// G16-C — pure e-mail templates for the pilot lifecycle. No sending here;
// the service passes the result to lib/email `sendEmail`. Every template
// carries the data sentence verbatim and the seller-of-record sender identity.

import { SENDER_IDENTITY_HTML, SENDER_IDENTITY_LINE } from "@/lib/email";
import { LEGAL_ENTITY } from "@/lib/site/legal-entity";
import { PILOT_INCLUDES, formatPilotPriceLong, type PilotSkuId } from "@/lib/pricing/pilot-skus";
import { formatAud } from "@/lib/plans-v2";
import {
  DATA_PRINCIPLE_SENTENCE,
  DEFAULT_PILOT_DAYS,
  PILOT_IN_RETURN,
  PILOT_LOI_PASS_MARK,
  PILOT_MAX_APPLICANTS,
  PILOT_NOT_INCLUDED,
  PILOT_SUCCESS_CRITERIA,
  programListPrice,
} from "./offer";

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://blockid.au").replace(/\/$/, "");
}

export interface EmailBody {
  subject: string;
  html: string;
  text: string;
}

const WRAP_OPEN = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:24px;background:#F1F5F9;color:#0F172A;font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;"><div style="max-width:600px;margin:0 auto;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:12px;padding:32px;"><p style="margin:0 0 8px 0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#64748B;">BlockID.au · Startup Value Index</p>`;
const WRAP_CLOSE = `<p style="margin:24px 0 0 0;font-size:11px;line-height:1.6;color:#64748B;">${SENDER_IDENTITY_HTML}</p></div></body></html>`;

function p(html: string): string {
  return `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;">${html}</p>`;
}
function h2(text: string): string {
  return `<h2 style="margin:22px 0 8px 0;font-size:15px;line-height:1.4;">${escapeHtml(text)}</h2>`;
}
function ul(items: readonly string[]): string {
  return `<ul style="margin:0 0 14px 20px;padding:0;font-size:14px;line-height:1.6;">${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`;
}
function fmtDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

export interface WelcomeInput {
  programName: string;
  intakeUrl: string | null;
  expiresAt: string;
  creditsGranted: number;
  days?: number;
}

/** Welcome: terms, intake URL, what is / isn't included, the data sentence verbatim. */
export function buildPilotWelcomeEmail(input: WelcomeInput): EmailBody {
  const days = input.days ?? DEFAULT_PILOT_DAYS;
  const site = siteUrl();
  const inbox = `${site}/workspace/accelerator/applications`;
  const subject = `Your BlockID pilot is live — ${input.programName} (${days} days, up to ${PILOT_MAX_APPLICANTS} applicants)`;
  const criteria = PILOT_SUCCESS_CRITERIA.map((c) => `${c.n}. ${c.criterion} — ${c.passMark} (${c.measuredBy})`);
  const html = [
    WRAP_OPEN,
    `<h1 style="margin:0 0 16px 0;font-size:20px;line-height:1.3;">Your pilot is live: ${escapeHtml(input.programName)}</h1>`,
    p(`Your workspace is on the <strong>Program</strong> tier (${escapeHtml(programListPrice())}/mo list) until <strong>${fmtDate(input.expiresAt)}</strong>, comped by an admin grant — no card, no Stripe. We also added <strong>${input.creditsGranted} credits</strong> for reports past the plan's monthly quota.`),
    input.intakeUrl
      ? p(`Your intake link: <a href="${escapeHtml(input.intakeUrl)}">${escapeHtml(input.intakeUrl)}</a><br>Put it on your application page — every applicant lands scored in your inbox at <a href="${escapeHtml(inbox)}">${escapeHtml(inbox)}</a>.`)
      : p(`Create your intake link from <a href="${escapeHtml(inbox)}">${escapeHtml(inbox)}</a> and put it on your application page — every applicant lands scored in your inbox.`),
    h2("What is included"),
    ul([
      `One live intake or cohort, up to ${PILOT_MAX_APPLICANTS} applicants, scored on the 8-dimension SVI rubric`,
      "Cohort table + CSV export, a sponsor / LP report sample, an Investor Dossier per startup",
      `${days} days from today`,
    ]),
    h2("What is not included"),
    ul(PILOT_NOT_INCLUDED),
    h2("In return"),
    ul(PILOT_IN_RETURN),
    h2(`Success criteria (LOI trigger: ≥ ${PILOT_LOI_PASS_MARK} of 7)`),
    ul(criteria),
    h2("Data"),
    p(`<em data-testid="pilot-data-sentence">${escapeHtml(DATA_PRINCIPLE_SENTENCE)}</em>`),
    p(`Reply to this e-mail for the day-0 call. Three days before the pilot ends you will get a reminder; on expiry the workspace returns to its previous plan unless you have subscribed.`),
    WRAP_CLOSE,
  ].join("");
  const text = [
    `Your pilot is live: ${input.programName}`,
    "",
    `Program tier (${programListPrice()}/mo list) until ${fmtDate(input.expiresAt)}, comped by an admin grant — no card, no Stripe. ${input.creditsGranted} credits added.`,
    input.intakeUrl ? `Intake link: ${input.intakeUrl}` : `Create your intake link at ${inbox}`,
    `Inbox: ${inbox}`,
    "",
    "Included:",
    `- One live intake or cohort, up to ${PILOT_MAX_APPLICANTS} applicants, 8-dimension SVI rubric`,
    "- Cohort table + CSV, sponsor / LP report sample, Investor Dossier per startup",
    `- ${days} days from today`,
    "",
    "Not included:",
    ...PILOT_NOT_INCLUDED.map((s) => `- ${s}`),
    "",
    "In return:",
    ...PILOT_IN_RETURN.map((s) => `- ${s}`),
    "",
    `Success criteria (LOI trigger: >= ${PILOT_LOI_PASS_MARK} of 7):`,
    ...criteria.map((s) => `- ${s}`),
    "",
    DATA_PRINCIPLE_SENTENCE,
    "",
    SENDER_IDENTITY_LINE,
  ].join("\n");
  return { subject, html, text };
}

export function buildPilotReminderEmail(input: { programName: string; expiresAt: string; daysLeft: number }): EmailBody {
  const subject = `Your BlockID pilot ends in ${input.daysLeft} day${input.daysLeft === 1 ? "" : "s"} — ${input.programName}`;
  const html = [
    WRAP_OPEN,
    `<h1 style="margin:0 0 16px 0;font-size:20px;line-height:1.3;">${escapeHtml(subject)}</h1>`,
    p(`The Program-tier comp for <strong>${escapeHtml(input.programName)}</strong> ends on <strong>${fmtDate(input.expiresAt)}</strong>. Export the cohort table + CSV before then.`),
    p(`To keep the workspace, subscribe to Program (${escapeHtml(programListPrice())}/mo) from <a href="${escapeHtml(siteUrl())}/pricing">${escapeHtml(siteUrl())}/pricing</a> — or reply to this e-mail for the day-30 review and the LOI.`),
    p(`<em>${escapeHtml(DATA_PRINCIPLE_SENTENCE)}</em>`),
    WRAP_CLOSE,
  ].join("");
  const text = `${subject}\n\nThe Program-tier comp for ${input.programName} ends on ${fmtDate(input.expiresAt)}. Export the cohort table + CSV before then.\nKeep the workspace: subscribe to Program (${programListPrice()}/mo) at ${siteUrl()}/pricing, or reply for the day-30 review and the LOI.\n\n${DATA_PRINCIPLE_SENTENCE}\n\n${SENDER_IDENTITY_LINE}`;
  return { subject, html, text };
}

export function buildPilotEndedEmail(input: { programName: string; reason: string; planReverted: boolean; previousPlan: string | null }): EmailBody {
  const expired = input.reason === "expired";
  const subject = expired ? `Your BlockID pilot has ended — ${input.programName}` : `Your BlockID pilot was closed — ${input.programName}`;
  const planLine = input.planReverted
    ? `Your workspace is back on the <strong>${escapeHtml(input.previousPlan ?? "free")}</strong> plan. Your data, cohort table and reports stay where they are.`
    : `Your subscription keeps the workspace on its current plan. Nothing else changes.`;
  const html = [
    WRAP_OPEN,
    `<h1 style="margin:0 0 16px 0;font-size:20px;line-height:1.3;">${escapeHtml(subject)}</h1>`,
    p(planLine),
    p(`To continue at list price, subscribe to Program (${escapeHtml(programListPrice())}/mo) from <a href="${escapeHtml(siteUrl())}/pricing">${escapeHtml(siteUrl())}/pricing</a>. Reply to this e-mail for the case study and the 45-minute interview.`),
    p(`<em>${escapeHtml(DATA_PRINCIPLE_SENTENCE)}</em>`),
    WRAP_CLOSE,
  ].join("");
  const text = `${subject}\n\n${planLine.replace(/<[^>]+>/g, "")}\nContinue at list price: Program (${programListPrice()}/mo) at ${siteUrl()}/pricing.\n\n${DATA_PRINCIPLE_SENTENCE}\n\n${SENDER_IDENTITY_LINE}`;
  return { subject, html, text };
}

export function buildPilotApplyAutoReply(input: { contactName: string; programName: string }): EmailBody {
  const subject = `We received your pilot application — ${input.programName}`;
  const html = [
    WRAP_OPEN,
    `<h1 style="margin:0 0 16px 0;font-size:20px;line-height:1.3;">Thanks, ${escapeHtml(input.contactName)} — we have your application</h1>`,
    p(`We read every pilot application by hand and reply within two business days. If ${escapeHtml(input.programName)} is a fit we will propose a day-0 call, agree the 7 success criteria and send the intake link.`),
    p(`Reminder of the offer: ${DEFAULT_PILOT_DAYS} days, up to ${PILOT_MAX_APPLICANTS} applicants, free — comped by an admin grant, no card required. In return: an LOI if ≥ ${PILOT_LOI_PASS_MARK} of 7 criteria pass, a named case study, your committee's top-10 before it sees ours, and one 45-minute interview.`),
    p(`<em>${escapeHtml(DATA_PRINCIPLE_SENTENCE)}</em>`),
    WRAP_CLOSE,
  ].join("");
  const text = `Thanks, ${input.contactName} — we have your application for ${input.programName}.\n\nWe reply within two business days. If it is a fit we propose a day-0 call, agree the 7 success criteria and send the intake link.\n\nOffer: ${DEFAULT_PILOT_DAYS} days, up to ${PILOT_MAX_APPLICANTS} applicants, free (admin grant, no card). In return: LOI if >= ${PILOT_LOI_PASS_MARK} of 7 criteria pass, a named case study, your top-10 before ours, one 45-minute interview.\n\n${DATA_PRINCIPLE_SENTENCE}\n\n${SENDER_IDENTITY_LINE}`;
  return { subject, html, text };
}

// ── G21 P0-C — paid Cohort Validation Pilot ─────────────────────────────────

export interface PaidWelcomeInput {
  sku: PilotSkuId;
  intakeUrl: string | null;
  expiresAt: string;
  applicantsCap: number;
  /** What Stripe actually charged (promo codes apply); falls back to the list price. */
  amountCents?: number | null;
  /** False when the buyer's own subscription was kept (no Cohort-tier grant). */
  planSet?: boolean;
}

/**
 * Confirmation after a paid pilot checkout: what happens next (we set the
 * intake up within 2 business days), what is included, the support address
 * from the canonical entity config, the data sentence verbatim. The Stripe
 * receipt / ATO tax invoice is sent by Stripe separately.
 */
export function buildPaidPilotWelcomeEmail(input: PaidWelcomeInput): EmailBody {
  const site = siteUrl();
  const inbox = `${site}/workspace/accelerator/applications`;
  const cohort = `${site}/workspace/evaluations/cohort`;
  const price = typeof input.amountCents === "number" && input.amountCents > 0 ? `${formatAud(input.amountCents / 100)} inc. GST` : formatPilotPriceLong(input.sku);
  const tierLine = input.planSet === false ? "Your existing plan stays as it is; the pilot runs on it" : `Your workspace has the Cohort tier until <strong>${fmtDate(input.expiresAt)}</strong>`;
  const tierText = input.planSet === false ? "Your existing plan stays as it is; the pilot runs on it" : `Cohort tier until ${fmtDate(input.expiresAt)}`;
  const subject = `Your BlockID Cohort Validation Pilot is confirmed — up to ${input.applicantsCap} applicants`;
  const nextSteps = [
    "Within 2 business days we set up your intake with you: application link, deck upload, startup URL and founder consent on the form.",
    "Every applicant is assessed on the Startup Value Index with an evidence confidence level; your evaluator table fills as they arrive.",
    "You get the cohort comparison, the top gaps and the final cohort report, then a feedback workshop with your review team.",
    "We measure the success metrics together: review time per startup, evaluator consistency, startups processed, evidence completion, satisfaction, renewal intent.",
  ];
  const html = [
    WRAP_OPEN,
    `<h1 style="margin:0 0 16px 0;font-size:20px;line-height:1.3;">Your Cohort Validation Pilot is confirmed</h1>`,
    p(`Thank you — <strong>${escapeHtml(price)}</strong> for one real intake or existing cohort of up to <strong>${input.applicantsCap} applicants</strong>. ${tierLine}; the tax invoice arrives from Stripe separately.`),
    h2("What happens next"),
    ul(nextSteps),
    input.intakeUrl
      ? p(`Your intake link is ready now: <a href="${escapeHtml(input.intakeUrl)}">${escapeHtml(input.intakeUrl)}</a><br>Applicants land scored in your inbox at <a href="${escapeHtml(inbox)}">${escapeHtml(inbox)}</a>; the cohort table is at <a href="${escapeHtml(cohort)}">${escapeHtml(cohort)}</a>.`)
      : p(`We create the intake link with you on the setup call; your inbox is <a href="${escapeHtml(inbox)}">${escapeHtml(inbox)}</a> and the cohort table is <a href="${escapeHtml(cohort)}">${escapeHtml(cohort)}</a>.`),
    h2("What is included"),
    ul(PILOT_INCLUDES),
    h2("Data"),
    p(`<em data-testid="pilot-data-sentence">${escapeHtml(DATA_PRINCIPLE_SENTENCE)}</em>`),
    p(`Questions or a date for the setup call: reply to this e-mail or write to <a href="mailto:${escapeHtml(LEGAL_ENTITY.supportEmail)}">${escapeHtml(LEGAL_ENTITY.supportEmail)}</a>. BlockID structures the evidence and standardises the first-pass analysis; your committee makes the decision.`),
    WRAP_CLOSE,
  ].join("");
  const text = [
    "Your Cohort Validation Pilot is confirmed",
    "",
    `${price} for one real intake or existing cohort of up to ${input.applicantsCap} applicants. ${tierText}; the tax invoice arrives from Stripe separately.`,
    "",
    "What happens next:",
    ...nextSteps.map((s) => `- ${s}`),
    "",
    input.intakeUrl ? `Intake link: ${input.intakeUrl}` : "We create the intake link with you on the setup call.",
    `Inbox: ${inbox}`,
    `Cohort table: ${cohort}`,
    "",
    "Included:",
    ...PILOT_INCLUDES.map((s) => `- ${s}`),
    "",
    DATA_PRINCIPLE_SENTENCE,
    "",
    `Questions: ${LEGAL_ENTITY.supportEmail}. BlockID structures the evidence and standardises the first-pass analysis; your committee makes the decision.`,
    "",
    SENDER_IDENTITY_LINE,
  ].join("\n");
  return { subject, html, text };
}
