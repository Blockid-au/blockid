/**
 * /one-click-report copy (G17 P2-A moved it out of page.tsx). The A$3
 * figure is the Trusted Business Report SKU (plans.csv `tbr_report`);
 * this page is one of the places a price may appear because it IS the
 * checkout landing (the price is the offer). React-free.
 */

export type OneClickIcon = "upload" | "credit-card" | "mail";

export interface OneClickStep {
  icon: OneClickIcon;
  title: string;
  body: string;
}

export const ONE_CLICK_STEPS: readonly OneClickStep[] = [
  {
    icon: "upload",
    title: "Choose pitch or URL",
    body: "Upload a PDF or DOCX pitch deck (up to 10 MB), or paste your website URL. Both feed the same analysis pipeline.",
  },
  {
    icon: "credit-card",
    title: "Pay A$3",
    body: "Secure checkout via Stripe. The price is GST-inclusive, and an ATO tax invoice is emailed automatically.",
  },
  {
    icon: "mail",
    title: "Report emailed",
    body: "Your full SVI investor brief arrives in ~2 minutes. Score, dimensions, valuation range, action list.",
  },
];

export const ONE_CLICK_DELIVERABLES: readonly string[] = [
  "SVI investor-ready score with confidence band",
  "8-dimension scorecard (FTV, MPC, PTD, TRE, CGH, IRI, LCO, SVM)",
  "Valuation range (low / mid / high) with method rationale",
  "Prioritised action list — the fastest score-lifting moves",
  "Comparable Australian exits pattern (anonymised)",
];

export const ONE_CLICK_TRUST: readonly string[] = [
  "GST tax invoice",
  "Emailed in ~2 min",
  "No signup required",
];

/**
 * FAQ answers that are plain strings. The refund answer carries a support
 * e-mail (ObfuscatedEmail) and is composed in page.tsx; its plain text lives
 * here for the FAQ JSON-LD.
 */
export const ONE_CLICK_FAQ = {
  refundQ: "What if I need my money back?",
  refundText:
    "If your report doesn't arrive or the analysis clearly failed, email admin@blockid.au and we'll refund the A$3 in full — no questions. It's a low-stakes trial for both of us.",
  rest: [
    {
      q: "How is my data used?",
      // T0275 (2026-09-10): founder-approved data principle, verbatim. Says
      // nothing about model training either way.
      a: "Your data belongs to your startup. We store it so every report builds on your own evidence and the AI reasons on your case. Founder-consented access tiers control who sees what. Your inputs are stored in Australia, never sold, and never shown to other users; you can request full deletion at any time. See /legal/privacy for the AI providers that may process a request.",
    },
    {
      q: "Do you keep my pitch deck?",
      a: "Only for as long as we need to generate your report — typically under an hour. After analysis, the raw upload is deleted. The generated PDF report is retained so we can re-send it if you lose the email.",
    },
    {
      q: "Can I upgrade to a subscription?",
      a: "Yes. After your Trusted Business Report, create a free BlockID account to save it, track your SVI over time, and unlock deeper analysis (comparables, evidence vault, per-investor share links). No upgrade pressure — the A$3 report is complete on its own.",
    },
  ],
} as const;

/**
 * The illustrative sample card (no live figures; the caption says so). Bar
 * widths are Tailwind literals, not inline styles (CSP: no inline styles).
 */
export const ONE_CLICK_SAMPLE = {
  score: 72,
  bars: ["w-[62%]", "w-[78%]", "w-[71%]", "w-[84%]", "w-[55%]", "w-[69%]", "w-[74%]", "w-[80%]"],
  range: "A$3.2M · A$5.8M · A$9.1M",
} as const;
