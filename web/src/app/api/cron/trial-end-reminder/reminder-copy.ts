// T-3d trial-ending reminder — plan display + email body (T0269 / G12-6).
//
// Every trial on this platform is card-required (founder + evaluator alike,
// founder decision D1 2026-09-10), so the copy reads "your card will be
// charged A$X on <date>; cancel any time before then" — never "add a payment
// method" / "downgrade to free". Kept outside route.ts so the colocated test
// can pin the copy without booting the Next route module.

import { getPlanCached } from "@/lib/plans-db";
import { TRIAL_COPY, formatAud } from "@/lib/plans/trial-copy";
import { evaluatorPlanLabel } from "@/lib/plans/signup-plans";

export interface ReminderPlanDisplay {
  /** Public plan name — Scout / Firm / Program for evaluator rungs. */
  name: string;
  /** "A$79" etc., or null when the plan row / price could not be resolved. */
  price: string | null;
}

/**
 * Resolve the display name + monthly price for the trialing plan. Never
 * throws — a missing row degrades to "your plan" with no price so the
 * reminder still goes out (the charge itself is Stripe's, not ours).
 */
export async function resolvePlanDisplay(
  planId: string | null | undefined,
): Promise<ReminderPlanDisplay> {
  if (!planId) return { name: "your plan", price: null };
  try {
    const row = await getPlanCached(planId);
    if (!row) return { name: evaluatorPlanLabel(planId) ?? planId, price: null };
    const price =
      typeof row.price_aud_cents === "number" && row.price_aud_cents > 0
        ? formatAud(row.price_aud_cents)
        : null;
    return { name: evaluatorPlanLabel(row.id) ?? row.name, price };
  } catch {
    return { name: evaluatorPlanLabel(planId) ?? planId, price: null };
  }
}

/** Email subject — names the charge when the price is known. */
export function reminderSubject(plan: ReminderPlanDisplay, trialEndFmt: string): string {
  return plan.price
    ? `Your BlockID trial ends in 3 days — your card will be charged ${plan.price} on ${trialEndFmt}`
    : "Your BlockID trial ends in 3 days";
}

/**
 * T-3d reminder body. The copy MUST read as a card-on-file trial ("your card
 * will be charged … cancel before …").
 */
export function renderReminder(args: {
  name: string;
  trialEndFmt: string;
  planName: string;
  price: string | null;
}): string {
  const esc = (s: string) =>
    s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
  const body = TRIAL_COPY.reminder_body({
    planName: args.planName,
    price: args.price,
    dateStr: args.trialEndFmt,
  });
  const footnote = TRIAL_COPY.reminder_footnote(args.trialEndFmt);
  return `<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,sans-serif;color:#1e293b;">
  <div style="max-width:560px;margin:24px auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;">
    <h1 style="margin:0 0 12px;font-size:20px;">Your trial ends ${esc(args.trialEndFmt)}</h1>
    <p>Hi ${esc(args.name)},</p>
    <p>${esc(body)}</p>
    <p><a href="https://blockid.au/workspace/billing" style="display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">Manage billing →</a></p>
    <p style="color:#64748b;font-size:12px;">${esc(footnote)}</p>
  </div></body></html>`;
}
