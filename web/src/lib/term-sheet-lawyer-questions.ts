// Deterministic lawyer-question generator for a Term Sheet AI v2 analysis.
//
// Runs server-side after Claude returns its structured analysis. We look for
// the founder-hostile clauses that a senior AU startup lawyer would drill on
// (multi-x liq pref, participating pref, full-ratchet anti-dilution, drag
// carve-outs, ROFR + tag-along skew, board tilts) and emit a ranked list of
// pointed questions the founder should walk in with. Severity is set from
// clause impact — not from the AI's own risk_level — so a 3x participating
// pref shows red even if Claude called it "high".

import "server-only";

export type LawyerQuestion = {
  severity: "red" | "amber" | "green";
  category: string;
  question: string;
  why: string;
};

interface Redline {
  clause?: unknown;
  issue?: unknown;
  severity?: unknown;
  risk_level?: unknown;
  suggestedRevision?: unknown;
}

interface KeyTerms {
  liquidationPreference?: unknown;
  boardSeatsToInvestor?: unknown;
  proRataRights?: unknown;
  optionPoolPostMoneyPct?: unknown;
  valuationCapAud?: unknown;
}

interface Analysis {
  redline?: Redline[];
  keyTerms?: KeyTerms;
  riskFlags?: Array<{ flag?: unknown; why?: unknown }>;
}

const SEVERITY_RANK: Record<LawyerQuestion["severity"], number> = {
  red: 3,
  amber: 2,
  green: 1,
};

function str(x: unknown): string {
  return typeof x === "string" ? x : "";
}

function corpus(analysis: Analysis): string {
  const parts: string[] = [];
  parts.push(str(analysis.keyTerms?.liquidationPreference));
  for (const r of analysis.redline ?? []) {
    parts.push(str(r.clause), str(r.issue), str(r.suggestedRevision));
  }
  for (const f of analysis.riskFlags ?? []) {
    parts.push(str(f.flag), str(f.why));
  }
  return parts.join(" \n ").toLowerCase();
}

export function generateLawyerQuestions(analysisRaw: unknown): LawyerQuestion[] {
  const analysis: Analysis =
    analysisRaw && typeof analysisRaw === "object" ? (analysisRaw as Analysis) : {};

  const text = corpus(analysis);
  const questions: LawyerQuestion[] = [];

  // Liquidation preference — anything above 1x, or participating, is red.
  const liqPref = str(analysis.keyTerms?.liquidationPreference).toLowerCase();
  const multiMatch = liqPref.match(/(\d+(?:\.\d+)?)\s*x/);
  const liqMultiple = multiMatch ? Number(multiMatch[1]) : null;
  // Must not match "non-participating" (the AU-market default) — guard the
  // left boundary with (^|\W|full-|fully-|1x |2x |3x ) so `non-participating`
  // is excluded but `1x participating` / `full participation` / bare
  // `participating` are still caught. QA report e0851d8 flagged this.
  const participatingRe = /(?:^|[^-a-z])participat(?:ing|ion)/i;
  const isParticipating =
    participatingRe.test(liqPref) || participatingRe.test(text);
  if (liqMultiple != null && liqMultiple > 1) {
    questions.push({
      severity: "red",
      category: "Liquidation preference",
      question: `Why is this a ${liqMultiple}x preference and not the AU-market 1x non-participating? What exit range does the investor model where this matters?`,
      why: `A ${liqMultiple}x pref reallocates the first $${liqMultiple.toFixed(0)} of every $1 invested to the investor before founders see anything at exit.`,
    });
  }
  if (isParticipating) {
    questions.push({
      severity: "red",
      category: "Liquidation preference",
      question:
        "Can we cap participation or convert to non-participating? What exit multiple do you model where the double-dip kicks in?",
      why: "Participating preferred lets the investor take their pref AND their pro-rata share of the rest — the founder is diluted twice on the same dollar.",
    });
  } else if (liqMultiple === 1) {
    questions.push({
      severity: "green",
      category: "Liquidation preference",
      question:
        "Confirm the 1x non-participating pref language matches AVCAL standard and doesn't hide seniority tricks in the definition.",
      why: "1x non-participating is AU market — verify wording rather than the headline number.",
    });
  }

  // Anti-dilution — full ratchet vs weighted average.
  if (/full[-\s]?ratchet/.test(text)) {
    questions.push({
      severity: "red",
      category: "Anti-dilution",
      question:
        "Can we swap full-ratchet anti-dilution for broad-based weighted average? Full ratchet on a down-round wipes founder equity.",
      why: "Full ratchet resets the investor's price to the new low price on any down round — catastrophic for founders in a soft market.",
    });
  } else if (/anti[-\s]?dilut/.test(text)) {
    questions.push({
      severity: "amber",
      category: "Anti-dilution",
      question:
        "Which anti-dilution formula applies — broad-based weighted average, narrow-based, or ratchet? Model the impact of a 25% down round.",
      why: "The formula wording determines whether a soft round dilutes founders by 5% or 30%.",
    });
  }

  // Drag-along.
  if (/drag[-\s]?along/.test(text)) {
    const majority = /(majority|>?\s*50%)/.test(text);
    questions.push({
      severity: majority ? "red" : "amber",
      category: "Drag-along",
      question:
        "What is the drag-along threshold, and does founder consent sit inside or outside it? Are minimum-price or asset-class carve-outs included?",
      why: "A low-threshold drag lets a simple majority force founders into a sale — carve-outs (price floor, founder consent) are the negotiation lever.",
    });
  }

  // ROFR + co-sale.
  if (/rofr|first refusal|right of first refusal/.test(text)) {
    questions.push({
      severity: "amber",
      category: "ROFR / transfer restrictions",
      question:
        "Does the ROFR apply to founder secondaries and permitted transfers to family trusts? What is the response window?",
      why: "ROFR wording often blocks founder liquidity events later — permitted-transfer carve-outs are standard AU practice.",
    });
  }

  // Board composition.
  const boardSeats = Number(analysis.keyTerms?.boardSeatsToInvestor);
  if (Number.isFinite(boardSeats) && boardSeats >= 2) {
    questions.push({
      severity: "red",
      category: "Board control",
      question: `Why does the investor need ${boardSeats} board seats at this stage? What is the total board composition and who breaks a tie?`,
      why: "Two investor seats at seed/Series A is unusual in AU — it changes control dynamics before scale.",
    });
  } else if (/board (control|majority|veto)/.test(text) || /investor\s+consent/.test(text)) {
    questions.push({
      severity: "amber",
      category: "Board control",
      question:
        "List every investor-consent / protective-provision line — which ones require investor sign-off on ordinary-course decisions (hiring, budget, bank accounts)?",
      why: "Protective provisions can hand day-to-day operating control to the investor even without a board majority.",
    });
  }

  // Option pool shuffle.
  const esopPct = Number(analysis.keyTerms?.optionPoolPostMoneyPct);
  if (Number.isFinite(esopPct) && esopPct >= 15) {
    questions.push({
      severity: "amber",
      category: "Option pool",
      question: `Is the ${esopPct.toFixed(1)}% ESOP top-up sized pre- or post-money? Model founder dilution both ways.`,
      why: "A large pre-money ESOP top-up dilutes founders only — post-money spreads it across all shareholders.",
    });
  }

  // Pro-rata rights.
  if (analysis.keyTerms?.proRataRights === true) {
    questions.push({
      severity: "green",
      category: "Pro-rata",
      question:
        "Does pro-rata survive future rounds, and does it apply only to major investors or all preferred holders?",
      why: "Pro-rata is standard; the wording matters — evergreen rights held by small holders can complicate later rounds.",
    });
  }

  // Founder vesting reset.
  if (/founder vest|reverse vest|re[-\s]?vest/.test(text)) {
    questions.push({
      severity: "red",
      category: "Founder vesting",
      question:
        "Are we being asked to re-vest already-earned founder shares? Push for credit-for-time-served and single-trigger acceleration on change of control.",
      why: "A vesting reset erases years of founder work — always negotiate credit for existing tenure.",
    });
  }

  // Valuation cap absurdly low.
  const cap = Number(analysis.keyTerms?.valuationCapAud);
  if (Number.isFinite(cap) && cap > 0 && cap < 1_000_000) {
    questions.push({
      severity: "red",
      category: "Valuation cap",
      question: `The $${cap.toLocaleString()} cap looks abnormally low for an AU SAFE — is this a data-entry error or an intentional post-money?`,
      why: "Sub-$1M caps at seed massively over-dilute founders on conversion — worth double-checking before signing.",
    });
  }

  // MFN / most favoured nation.
  if (/most favou?red nation|\bmfn\b/.test(text)) {
    questions.push({
      severity: "amber",
      category: "MFN",
      question:
        "Does the MFN apply per-clause or all-or-nothing? Can we exclude terms that are commercially irrelevant to this investor?",
      why: "All-or-nothing MFNs let one investor cherry-pick every founder-hostile clause from every future SAFE.",
    });
  }

  // Always end with a catch-all "unknowns" question.
  questions.push({
    severity: "green",
    category: "Missing terms",
    question:
      "Which standard AU seed/Series A terms are absent from this document that we should insist on adding — e.g. information rights cap, D&O insurance, founder-friendly IP assignment carve-outs?",
    why: "Absent clauses are as risky as present ones — an experienced lawyer will spot the standard protections that were quietly dropped.",
  });

  questions.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
  return questions.slice(0, 10);
}
