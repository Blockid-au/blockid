// CRO Domain: A/B Test Hypothesis Library
//
// Curated, prioritised A/B test ideas mapped to each step of the BlockID
// assessment funnel (see STEP_LABELS in /admin/funnel/page.tsx). Used to
// recommend the next experiment for whichever step has the biggest drop-off,
// and as a research source for CRO/CMO agents when planning sprints.

export type Effort = "low" | "med" | "high";
export type Confidence = "low" | "med" | "high";

export interface ABTestHypothesis {
  id: string;
  funnelStep: string;
  title: string;
  hypothesis: string;
  control: string;
  variant: string;
  metric: string;
  expectedLiftPct: number;
  effort: Effort;
  confidence: Confidence;
  rationale: string;
  tags: string[];
}

const EFFORT_RANK: Record<Effort, number> = { low: 0, med: 1, high: 2 };
const CONFIDENCE_RANK: Record<Confidence, number> = { low: 0, med: 1, high: 2 };

export const AB_TEST_HYPOTHESES: ABTestHypothesis[] = [
  // ── landing_visit → signup_start ──────────────────────────────────────
  {
    id: "EXP-LV-01",
    funnelStep: "landing_visit",
    title: "Outcome-led headline vs feature headline",
    hypothesis:
      "Visitors who see an outcome-led headline (\"Know what your AU startup is worth in 5 minutes\") start signup more often than visitors who see a feature-led one.",
    control: "Current product/feature-led hero headline.",
    variant: "Outcome-led headline + 5-minute time promise + visible \"Free\" badge.",
    metric: "landing_visit → signup_start CTR",
    expectedLiftPct: 18,
    effort: "low",
    confidence: "high",
    rationale:
      "ConversionXL and Unbounce meta-analyses consistently show outcome-led headlines beat feature-led ones on B2B SaaS landers by 10-25%.",
    tags: ["copy", "hero"],
  },
  {
    id: "EXP-LV-02",
    funnelStep: "landing_visit",
    title: "Social proof above the fold",
    hypothesis:
      "Showing live social proof (\"312 AU founders analysed this week\") above the fold lifts signup intent by reducing first-visit anxiety.",
    control: "No counter above the fold.",
    variant: "Animated counter pulling from svi_accounts row count, refreshed weekly.",
    metric: "scroll-to-form rate + signup_start CTR",
    expectedLiftPct: 8,
    effort: "med",
    confidence: "med",
    rationale:
      "Social proof above the fold lifts conversion 5-12% in B2B SaaS (CXL Institute). Cheap to ship since counter data already exists in Supabase.",
    tags: ["social-proof", "hero"],
  },
  {
    id: "EXP-LV-03",
    funnelStep: "landing_visit",
    title: "Inline assessment teaser",
    hypothesis:
      "Letting visitors answer the first SVI question inline (idea + stage) before signup converts more curious browsers because they've already invested effort.",
    control: "CTA → /signup.",
    variant: "Two-field micro-form (idea, stage) → preview score → signup wall.",
    metric: "landing_visit → signup_start",
    expectedLiftPct: 22,
    effort: "med",
    confidence: "med",
    rationale:
      "Endowed progress + sunk-cost effect — partial completion before signup is a well-documented lift (Typeform 2019, NerdWallet case studies).",
    tags: ["product-led", "endowed-progress"],
  },

  // ── signup_start → signup_complete ────────────────────────────────────
  {
    id: "EXP-SS-01",
    funnelStep: "signup_start",
    title: "One-tap Google / LinkedIn signup",
    hypothesis:
      "OAuth signup (Google + LinkedIn) reduces drop-off vs email + password because AU founders already have both accounts and dislike password creation on mobile.",
    control: "Email + password form only.",
    variant: "OAuth buttons primary, email fallback secondary.",
    metric: "signup_start → signup_complete",
    expectedLiftPct: 30,
    effort: "high",
    confidence: "high",
    rationale:
      "Auth0 and Stytch benchmarks show 20-40% completion lift when OAuth is offered as the primary path on mobile-heavy B2B landing.",
    tags: ["auth", "mobile"],
  },
  {
    id: "EXP-SS-02",
    funnelStep: "signup_start",
    title: "Magic-link only (passwordless)",
    hypothesis:
      "Email-only magic-link signup converts higher than email + password because it removes the password creation step entirely.",
    control: "Email + password.",
    variant: "Email only → magic link sent (already wired via /auth/verify).",
    metric: "signup_start → signup_complete",
    expectedLiftPct: 14,
    effort: "low",
    confidence: "high",
    rationale:
      "Magic-link flows already exist in the codebase (auth/verify). Slack, Notion and Substack all measured 10-20% lifts moving to passwordless.",
    tags: ["auth", "passwordless"],
  },

  // ── signup_complete → onboarding_start ────────────────────────────────
  {
    id: "EXP-SC-01",
    funnelStep: "signup_complete",
    title: "Skip welcome screen, deep-link to onboarding step 1",
    hypothesis:
      "Redirecting users directly into onboarding step 1 instead of showing an interstitial welcome screen reduces friction and lifts onboarding starts.",
    control: "Welcome screen with \"Get Started\" button.",
    variant: "Direct redirect to /onboarding (no interstitial).",
    metric: "signup_complete → onboarding_start",
    expectedLiftPct: 12,
    effort: "low",
    confidence: "med",
    rationale:
      "Every additional click before value loses 5-15% of users (Linear, Loom onboarding teardown). The welcome screen adds no information they didn't see on signup.",
    tags: ["onboarding", "friction"],
  },

  // ── onboarding_start → idea_submitted ─────────────────────────────────
  {
    id: "EXP-OS-01",
    funnelStep: "onboarding_start",
    title: "Progress bar with explicit % complete",
    hypothesis:
      "Showing a 3-step progress bar with current % at the top of onboarding lifts completion because users know how much is left.",
    control: "Step labels only, no progress %.",
    variant: "Sticky progress bar (33% → 66% → 100%) at the top of every step.",
    metric: "onboarding_start → idea_submitted",
    expectedLiftPct: 9,
    effort: "low",
    confidence: "high",
    rationale:
      "Progress indicators reduce abandonment 5-12% across onboarding wizards (Userlist 2024, Appcues 2023).",
    tags: ["onboarding", "progress"],
  },
  {
    id: "EXP-OS-02",
    funnelStep: "onboarding_start",
    title: "Smart-fill from company URL",
    hypothesis:
      "Asking for a company URL first and pre-filling name/sector/stage from a free scrape removes 60% of typing and lifts step-1 completion.",
    control: "Empty fields, manual entry.",
    variant: "URL field → auto-populate via existing scrape pipeline.",
    metric: "onboarding_start → idea_submitted",
    expectedLiftPct: 25,
    effort: "med",
    confidence: "med",
    rationale:
      "Auto-fill pipeline already exists for logged-in search. Re-using it in onboarding leverages a working asset for a high-friction step.",
    tags: ["auto-fill", "onboarding"],
  },

  // ── idea_submitted → svi_complete ─────────────────────────────────────
  {
    id: "EXP-IS-01",
    funnelStep: "idea_submitted",
    title: "Live scoring animation during SVI run",
    hypothesis:
      "Showing each of the 13 SVI dimensions scoring live (1-2s each) keeps users engaged through the analysis instead of dropping during the wait.",
    control: "Single spinner with \"Analysing…\".",
    variant: "Dimension-by-dimension reveal with running total.",
    metric: "idea_submitted → svi_complete",
    expectedLiftPct: 11,
    effort: "med",
    confidence: "med",
    rationale:
      "Perceived performance — staged reveals beat single spinners on multi-second async tasks. Reduces tab-switch abandonment.",
    tags: ["perceived-perf", "ux"],
  },

  // ── svi_complete → valuation_viewed ───────────────────────────────────
  {
    id: "EXP-SV-01",
    funnelStep: "svi_complete",
    title: "Push valuation hero directly on results page",
    hypothesis:
      "Inlining a teaser valuation range (bear/base/bull) on the SVI results page drives more clicks to /dashboard/valuation than a CTA card.",
    control: "\"View Valuation Report\" CTA card.",
    variant: "Inline valuation range hero + CTA \"See full breakdown\".",
    metric: "svi_complete → valuation_viewed",
    expectedLiftPct: 19,
    effort: "med",
    confidence: "high",
    rationale:
      "Showing the number before asking for the click leverages curiosity. The user already paid the credit — withholding the answer behind a click adds drop-off.",
    tags: ["progressive-disclosure", "results"],
  },

  // ── valuation_viewed → upgrade_prompt_seen ────────────────────────────
  {
    id: "EXP-VV-01",
    funnelStep: "valuation_viewed",
    title: "Locked-tab teaser (Comparables, Raise Plan)",
    hypothesis:
      "Showing locked but visible tabs (with blurred content + lock icon) creates more upgrade-prompt views than hiding them entirely.",
    control: "Tabs only show for paid users.",
    variant: "All 6 tabs visible — locked tabs blur the content and CTA upgrade.",
    metric: "valuation_viewed → upgrade_prompt_seen",
    expectedLiftPct: 35,
    effort: "med",
    confidence: "high",
    rationale:
      "\"Soft paywall\" pattern (Substack, NYTimes) consistently outperforms hard gates because curiosity about what's hidden is the conversion trigger.",
    tags: ["paywall", "upsell"],
  },

  // ── upgrade_prompt_seen → checkout_started ────────────────────────────
  {
    id: "EXP-UP-01",
    funnelStep: "upgrade_prompt_seen",
    title: "Anchor pricing — show A$299 strikethrough",
    hypothesis:
      "Anchoring the Founding 50 A$49 offer with a strikethrough A$299 reference lifts perceived value and click-through to checkout.",
    control: "A$49 price displayed flat.",
    variant: "A$299 strikethrough → A$49 with \"Founding 50\" badge.",
    metric: "upgrade_prompt_seen → checkout_started",
    expectedLiftPct: 16,
    effort: "low",
    confidence: "high",
    rationale:
      "Anchoring is one of the most robust pricing biases — Kahneman + every SaaS pricing teardown of the last decade.",
    tags: ["pricing", "anchor"],
  },
  {
    id: "EXP-UP-02",
    funnelStep: "upgrade_prompt_seen",
    title: "Scarcity counter — \"N of 50 founder seats left\"",
    hypothesis:
      "Showing live remaining seats on the Founding 50 offer creates urgency and lifts checkout starts.",
    control: "Static \"Founding 50\" badge.",
    variant: "Live counter pulling paid-user count from Supabase.",
    metric: "upgrade_prompt_seen → checkout_started",
    expectedLiftPct: 12,
    effort: "med",
    confidence: "med",
    rationale:
      "Genuine scarcity (not fabricated) is ethical and effective. Counter must be real — the 50-seat number is already in the offer.",
    tags: ["scarcity", "pricing"],
  },

  // ── checkout_started → payment_complete ───────────────────────────────
  {
    id: "EXP-CS-01",
    funnelStep: "checkout_started",
    title: "Apple Pay / Google Pay buttons above card form",
    hypothesis:
      "Surfacing Apple Pay / Google Pay at the top of Stripe Checkout lifts payment completion, particularly on mobile.",
    control: "Card form first, wallet buttons below.",
    variant: "Wallet buttons above card form (Stripe payment_method_order).",
    metric: "checkout_started → payment_complete",
    expectedLiftPct: 8,
    effort: "low",
    confidence: "high",
    rationale:
      "Stripe's own data shows 5-10% lift when Apple/Google Pay are surfaced first on mobile. Pure config change in payment_method_order.",
    tags: ["checkout", "mobile"],
  },
  {
    id: "EXP-CS-02",
    funnelStep: "checkout_started",
    title: "Money-back guarantee badge on checkout",
    hypothesis:
      "Adding a clear \"14-day refund, no questions\" badge inside checkout reduces payment hesitation for first-time AU buyers.",
    control: "No guarantee badge.",
    variant: "Visible guarantee badge + 1-line copy under the card form.",
    metric: "checkout_started → payment_complete",
    expectedLiftPct: 7,
    effort: "low",
    confidence: "med",
    rationale:
      "Risk reversal is consistently the highest-ROI checkout copy lever in B2B SaaS, especially for first-time buyers under A$100.",
    tags: ["checkout", "risk-reversal"],
  },
];

export function getHypothesesForStep(step: string): ABTestHypothesis[] {
  return AB_TEST_HYPOTHESES.filter((h) => h.funnelStep === step);
}

/**
 * Score: prefer high expected lift, then lower effort, then higher confidence.
 * Returns a sorted copy.
 */
export function rankHypotheses(hypotheses: ABTestHypothesis[]): ABTestHypothesis[] {
  return [...hypotheses].sort((a, b) => {
    if (b.expectedLiftPct !== a.expectedLiftPct) return b.expectedLiftPct - a.expectedLiftPct;
    if (EFFORT_RANK[a.effort] !== EFFORT_RANK[b.effort]) return EFFORT_RANK[a.effort] - EFFORT_RANK[b.effort];
    return CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence];
  });
}

export function getTopHypothesisForStep(step: string): ABTestHypothesis | null {
  const candidates = getHypothesesForStep(step);
  if (candidates.length === 0) return null;
  return rankHypotheses(candidates)[0];
}
