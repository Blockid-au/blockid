// Copy registry for upgrade CTAs — shared by UpgradeModal + UpgradeBanner.

import type { UpgradeTrigger } from "@/hooks/useUpgradePrompt";

export interface UpgradeCopy {
  headline: string;
  body: string;
  primaryCta: string;
  secondaryCta?: string;
  urgency?: string;
  suggestedPlan: string;
}

export const UPGRADE_COPY: Record<UpgradeTrigger, UpgradeCopy> = {
  feature_gate_hit: {
    headline: "Unlock this workflow",
    body: "This tool is part of the Growth plan. Start a 7-day trial — cancel anytime, no charge until day 7.",
    primaryCta: "Start free trial",
    secondaryCta: "See what's included",
    suggestedPlan: "founder_growth",
  },
  trial_day_5: {
    headline: "Two days left in your trial",
    body: "You've made real progress. Lock in Growth to keep your cap table, data room, and investor links.",
    primaryCta: "Keep my access",
    secondaryCta: "See other plans",
    suggestedPlan: "founder_growth",
  },
  trial_day_6: {
    headline: "One day left in your trial",
    body: "Your trial ends tomorrow. Confirm your plan now so nothing switches off mid-fundraise.",
    primaryCta: "Confirm plan",
    urgency: "Ends in 24 hours",
    suggestedPlan: "founder_growth",
  },
  trial_day_7: {
    headline: "Your trial ends today",
    body: "Your card will be charged today unless you change plan. Downgrade or cancel with one click.",
    primaryCta: "Manage subscription",
    secondaryCta: "Downgrade to Starter",
    urgency: "Last day",
    suggestedPlan: "founder_growth",
  },
  credits_low: {
    headline: "Credits running low",
    body: "You're under 20% of this month's credits. Top up now or move up to a plan with more headroom.",
    primaryCta: "See top-up options",
    secondaryCta: "View plans",
    suggestedPlan: "founder_growth",
  },
  credits_exhausted: {
    headline: "You're out of credits",
    body: "Reports pause until credits refresh next cycle. Add credits or upgrade to unblock instantly.",
    primaryCta: "Add credits",
    secondaryCta: "Upgrade plan",
    suggestedPlan: "founder_growth",
  },
  report_cap_hit: {
    headline: "Report limit reached",
    body: "You've hit this month's report cap. Growth gives you 5× the volume and unlocks premium templates.",
    primaryCta: "Upgrade to Growth",
    suggestedPlan: "founder_growth",
  },
  watchlist_cap_hit: {
    headline: "Watchlist full",
    body: "Angels tracking 50+ deals see 3× higher hit rate. Move up to Advisor for unlimited seats.",
    primaryCta: "Compare investor plans",
    suggestedPlan: "investor_advisor",
  },
  cohort_seat_cap_hit: {
    headline: "Cohort seats full",
    body: "You've filled every seat on this cohort. Accelerator Growth adds 25 founders + LP-ready quarterly reports.",
    primaryCta: "Upgrade cohort",
    suggestedPlan: "accelerator_growth",
  },
  post_cancel_winback: {
    headline: "Come back with 30% off",
    body: "We saved your data. Return in the next 14 days and we'll knock 30% off your first three months.",
    primaryCta: "Reactivate with COMEBACK30",
    secondaryCta: "Not yet",
    suggestedPlan: "founder_growth",
  },
};
