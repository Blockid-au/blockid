/**
 * /one-click-report copy (G17 P2-A moved it out of page.tsx). The price is
 * the guest Trusted Business Report SKU; this page is one of the places a
 * price may appear because it IS the checkout landing (the price is the
 * offer). React-free.
 *
 * Pricing v5 P5 (D26): with `platform_config.payg_enabled` on, the page is
 * the guest pay-as-you-go entry — the visitor picks Snapshot or Full (e-mail
 * required, claimable into an account later); Verified needs sign-in. Every
 * builder takes the PaygView; the `ONE_CLICK_*` constants are the flag-OFF
 * copy (today's page). Amounts are read from the view, never typed.
 */

import { PAYG_OFF_VIEW, type PaygView } from "@/lib/pricing/payg-copy";
import { PAYG_SKUS } from "@/lib/pricing/v5-payg";

export type OneClickIcon = "upload" | "credit-card" | "mail";

export interface OneClickStep {
  icon: OneClickIcon;
  title: string;
  body: string;
}

export function oneClickSteps(view: PaygView): readonly OneClickStep[] {
  return [
    {
      icon: "upload",
      title: "Choose pitch or URL",
      body: "Upload a PDF or DOCX pitch deck (up to 10 MB), or paste your website URL. Both feed the same analysis pipeline.",
    },
    view.enabled
      ? {
          icon: "credit-card",
          title: "Pick Snapshot or Full",
          body: `Snapshot ${view.snapshot} or Full ${view.full} inc. GST. You confirm the price before secure checkout via Stripe, and an ATO tax invoice is emailed automatically.`,
        }
      : {
          icon: "credit-card",
          title: `Pay ${view.reportEntry}`,
          body: "Secure checkout via Stripe. The price is GST-inclusive, and an ATO tax invoice is emailed automatically.",
        },
    {
      icon: "mail",
      title: "Report emailed",
      body: view.enabled
        ? "Your report arrives by email, usually within minutes. Create an account later with the same email to keep it."
        : "Your full SVI investor brief arrives in ~2 minutes. Score, dimensions, valuation range, action list.",
    },
  ];
}

export const ONE_CLICK_STEPS: readonly OneClickStep[] = oneClickSteps(PAYG_OFF_VIEW);

export const ONE_CLICK_DELIVERABLES: readonly string[] = [
  "SVI investor-ready score with confidence band",
  "8-dimension scorecard (FTV, MPC, PTD, TRE, CGH, IRI, LCO, SVM)",
  "Valuation range (low / mid / high) with method rationale",
  "Prioritised action list — the fastest score-lifting moves",
  "Comparable Australian exits pattern (anonymised)",
];

/** Flag ON: what each guest tier contains, from the PAYG catalogue. */
export function oneClickDeliverables(view: PaygView): readonly string[] {
  if (!view.enabled) return ONE_CLICK_DELIVERABLES;
  const snapshot = PAYG_SKUS.report_snapshot.included;
  const fullOnly = PAYG_SKUS.report_full.included.filter((l) => !snapshot.includes(l));
  return [
    `Snapshot (${view.snapshot}): ${snapshot.join(" · ")}`,
    `Full (${view.full}): the Snapshot's score and risks, plus ${fullOnly.join(" · ")}`,
    `Verified (${view.verified}) adds a review of the evidence by the BlockID team — sign in to order it`,
  ];
}

export const ONE_CLICK_TRUST: readonly string[] = [
  "GST tax invoice",
  "Emailed in ~2 min",
  "No signup required",
];

export interface OneClickFaqCopy {
  refundQ: string;
  /** Plain text of the refund answer (FAQ JSON-LD). */
  refundText: string;
  rest: readonly { q: string; a: string }[];
}

const DATA_FAQ = [
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
] as const;

/**
 * FAQ answers that are plain strings. The refund answer carries a support
 * e-mail (ObfuscatedEmail) and is composed in page.tsx; its plain text lives
 * here for the FAQ JSON-LD. Flag ON follows Terms v2.2 (refund in full when
 * the report does not arrive or the analysis clearly failed).
 */
export function oneClickFaq(view: PaygView): OneClickFaqCopy {
  if (!view.enabled) {
    return {
      refundQ: "What if I need my money back?",
      refundText: `If your report doesn't arrive or the analysis clearly failed, email admin@blockid.au and we'll refund the ${view.reportEntry} in full — no questions. It's a low-stakes trial for both of us.`,
      rest: [
        ...DATA_FAQ,
        {
          q: "Can I upgrade to a subscription?",
          a: `Yes. After your Trusted Business Report, create a free BlockID account to save it, track your SVI over time, and unlock deeper analysis (comparables, evidence vault, per-investor share links). No upgrade pressure — the ${view.reportEntry} report is complete on its own.`,
        },
      ],
    };
  }
  return {
    refundQ: "What if I need my money back?",
    refundText: "If your report doesn't arrive or the analysis clearly failed, email admin@blockid.au and we'll refund it in full.",
    rest: [
      {
        q: "Snapshot or Full — which should I pick?",
        a: `The Snapshot (${view.snapshot}) is the score, the 8-dimension radar, your top three strengths and risks and how confident the evidence is, on one page. The Full report (${view.full}) is all 16 sections — Australian comparables, the evidence register and the questions an investor will ask next. Both are one-off, inc. GST.`,
      },
      {
        q: "Can I get a Verified report without an account?",
        a: `No. Verified (${view.verified}) has the evidence reviewed by the BlockID team within ${view.slaDays} business days, so it is tied to an account — sign in first, then order it.`,
      },
      ...DATA_FAQ,
      {
        q: "Can I keep the report in an account later?",
        a: "Yes. Create a free BlockID account with the same email and the report is yours to keep, re-run and share. No upgrade pressure — a single report is complete on its own.",
      },
    ],
  };
}

export const ONE_CLICK_FAQ = oneClickFaq(PAYG_OFF_VIEW);

/** Page copy that names the price (hero sub, closing lede, metadata). */
export function oneClickPageCopy(view: PaygView): {
  heroSub: string;
  ctaLede: string;
  metaTitle: string;
  metaDescription: string;
} {
  if (!view.enabled) {
    return {
      heroSub: `Upload your pitch deck or paste your website. Get the full Trusted Business Report — your Startup Value Index score across 8 dimensions and an AUD valuation range — in your inbox. No signup. ${view.reportEntry} inc. GST`,
      ctaLede: `${view.reportEntry} GST-inclusive, with an ATO tax invoice. Emailed in ~2 minutes. No signup.`,
      metaTitle: `Trusted Business Report — ${view.reportEntry}, no signup`,
      metaDescription:
        "How investors see your startup: upload a pitch or paste a URL and get the full Trusted Business Report — SVI score and AUD valuation range — by e-mail in minutes.",
    };
  }
  return {
    heroSub: `Upload your pitch deck or paste your website, then pick a Snapshot (${view.snapshot} inc. GST) or the Full Trusted Business Report (${view.full} inc. GST) — your Startup Value Index score across 8 dimensions, in your inbox. No signup; keep it in an account later.`,
    ctaLede: `Snapshot ${view.snapshot} or Full ${view.full} inc. GST, with an ATO tax invoice. No signup — just your email.`,
    metaTitle: `Trusted Business Report — from ${view.snapshot}, no signup`,
    metaDescription:
      "How investors see your startup: upload a pitch or paste a URL and get a Snapshot or Full Trusted Business Report — SVI score and evidence — by e-mail.",
  };
}

/**
 * The illustrative sample card (no live figures; the caption says so). Bar
 * widths are Tailwind literals, not inline styles (CSP: no inline styles).
 */
export const ONE_CLICK_SAMPLE = {
  score: 72,
  bars: ["w-[62%]", "w-[78%]", "w-[71%]", "w-[84%]", "w-[55%]", "w-[69%]", "w-[74%]", "w-[80%]"],
  range: "A$3.2M · A$5.8M · A$9.1M",
} as const;
