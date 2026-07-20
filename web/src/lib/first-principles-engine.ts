import "server-only";
import { detectSector, SECTOR_LABELS } from "@/lib/svi-analysis";

export type FirstPrinciplesQuestion = {
  id: string;
  prompt: string;
  category: "problem" | "customer" | "solution" | "moat" | "market" | "monetization";
  followUps?: string[];
};

export type Recommendation = {
  primaryFeature: string;
  primaryFeatureHref: string;
  rationale: string;
  secondaryFeatures: Array<{ label: string; href: string }>;
};

// A single library of Socratic prompts keyed by the signal that's missing
// from the founder's initial idea. `generateInitialQuestions` picks the
// 5–7 whose triggers are absent so the founder isn't asked to restate
// what they already told us.
type QuestionRule = {
  question: FirstPrinciplesQuestion;
  triggerWhenMissing: (text: string) => boolean;
};

const RULES: QuestionRule[] = [
  {
    triggerWhenMissing: (t) => !/\bproblem\b|\bpain\b|\bstruggle\b|\bfrustrat\w*/i.test(t),
    question: {
      id: "problem",
      prompt: "What specific problem does this solve, and how painful is it today on a 1–10 scale for the person feeling it?",
      category: "problem",
      followUps: ["Who feels it most acutely?", "How are they solving it right now?"],
    },
  },
  {
    triggerWhenMissing: (t) => !/\bcustomer\b|\buser\b|\bICP\b|\bpersona\b|\btarget\b|\bfor\s+(smb|sme|enterprise|founder|accountant|tradie|nurse|teacher|patient)/i.test(t),
    question: {
      id: "customer",
      prompt: "Who is the exact first customer — job title, company size, industry, location? Not 'businesses' — one narrow segment.",
      category: "customer",
      followUps: ["How many exist in Australia?", "How would you reach the first 10?"],
    },
  },
  {
    triggerWhenMissing: (t) => !/\bexisting\b|\balternative\b|\bcompet\w*|\bincumbent\b|\bmanual\b|\bspreadsheet\b/i.test(t),
    question: {
      id: "status_quo",
      prompt: "What are people using instead today — a competitor, a spreadsheet, or nothing? Why is that painful enough to switch?",
      category: "problem",
    },
  },
  {
    triggerWhenMissing: (t) => !/\bwhy\s+(you|now|us)\b|\bunique\b|\bunfair\b|\binsight\b|\bexperienc\w*|\bdomain\b/i.test(t),
    question: {
      id: "unfair_advantage",
      prompt: "Why you? What unfair advantage, insight, or lived experience do you have that competitors don't?",
      category: "moat",
    },
  },
  {
    triggerWhenMissing: (t) => !/\bmoat\b|\bpatent\b|\bnetwork\s*effect\b|\bswitching\s*cost\b|\bdata\s*advantage\b|\bIP\b/i.test(t),
    question: {
      id: "moat",
      prompt: "Once you're in market, what stops a well-funded incumbent copying you in 6 months?",
      category: "moat",
    },
  },
  {
    triggerWhenMissing: (t) => !/\btam\b|\bsam\b|\bsom\b|\bmarket\s*size\b|\bbillion\b|\bmillion\b/i.test(t),
    question: {
      id: "market_size",
      prompt: "Roughly how big is the addressable market in AUD — and how did you arrive at that number?",
      category: "market",
    },
  },
  {
    triggerWhenMissing: (t) => !/\bprice|\bpricing\b|\brevenue\b|\bmrr\b|\barr\b|\bsubscription\b|\bfee\b|\btransaction\b|\bmonetiz\w*/i.test(t),
    question: {
      id: "monetization",
      prompt: "How will you make money — subscription, transaction fee, licence, marketplace take-rate? What will a customer pay per month?",
      category: "monetization",
    },
  },
  {
    triggerWhenMissing: (t) => !/\bmvp\b|\bprototype\b|\bdemo\b|\bproduct\b|\bbeta\b|\blive\b|\bshipped\b/i.test(t),
    question: {
      id: "solution",
      prompt: "What's the smallest thing you could ship in 30 days that would prove the core assumption?",
      category: "solution",
    },
  },
  {
    triggerWhenMissing: (t) => !/\bcustomer\s+interview\b|\bwaitlist\b|\bloi\b|\bletter\s+of\s+intent\b|\bsigned\b|\bpilot\b|\bpaid\b/i.test(t),
    question: {
      id: "validation",
      prompt: "What evidence do you already have that people want this — interviews, waitlist signups, letters of intent, pre-orders?",
      category: "customer",
    },
  },
  {
    triggerWhenMissing: (t) => !/\bco.?founder\b|\bteam\b|\bhire\b|\bcto\b|\bcmo\b|\bcoo\b/i.test(t),
    question: {
      id: "team",
      prompt: "Who is building this with you? If solo, what's the plan to bring on a technical or commercial co-founder?",
      category: "solution",
    },
  },
];

// Fallback probes when the idea is so terse that most rules fire.
// We still cap the returned list so the founder isn't overwhelmed.
const CORE_FALLBACK: FirstPrinciplesQuestion[] = [
  {
    id: "problem",
    prompt: "What specific problem does this solve, and how painful is it today?",
    category: "problem",
  },
  {
    id: "customer",
    prompt: "Who is the exact first customer — one narrow segment?",
    category: "customer",
  },
  {
    id: "unfair_advantage",
    prompt: "Why you? What unfair advantage do you have?",
    category: "moat",
  },
  {
    id: "monetization",
    prompt: "How will you make money and at what price point?",
    category: "monetization",
  },
  {
    id: "validation",
    prompt: "What evidence do you have that people want this?",
    category: "customer",
  },
];

export function generateInitialQuestions(ideaText: string): FirstPrinciplesQuestion[] {
  const text = (ideaText ?? "").slice(0, 4000);
  const picked: FirstPrinciplesQuestion[] = [];
  const seen = new Set<string>();

  for (const rule of RULES) {
    if (rule.triggerWhenMissing(text) && !seen.has(rule.question.id)) {
      picked.push(rule.question);
      seen.add(rule.question.id);
    }
    if (picked.length >= 7) break;
  }

  // Guarantee at least 5 — if the input is unusually detailed and few rules
  // triggered, top up from the core fallback so the flow always has substance.
  for (const q of CORE_FALLBACK) {
    if (picked.length >= 5) break;
    if (!seen.has(q.id)) {
      picked.push(q);
      seen.add(q.id);
    }
  }

  return picked.slice(0, 7);
}

// -----------------------------------------------------------------------------
// Routing. We score each destination on how strongly the founder's answers
// (plus original idea) hint that surface is the next best step, then return
// the highest scorer as `primaryFeature` with the runner-ups as secondaries.
// -----------------------------------------------------------------------------

type Destination = {
  key: string;
  label: string;
  href: string;
  rationaleTemplate: (ctx: { sectorLabel?: string }) => string;
  score: (blob: string) => number;
};

const DESTINATIONS: Destination[] = [
  {
    key: "svi",
    label: "Run full SVI Analysis",
    href: "/svi",
    rationaleTemplate: ({ sectorLabel }) =>
      sectorLabel
        ? `You've clarified the shape of a ${sectorLabel} startup — the SVI report will score all 13 criteria and benchmark you against peers.`
        : "You've clarified the core shape of the idea — the SVI report will score all 13 criteria and give you a stage-appropriate action plan.",
    score: (t) => {
      // Default fallback wins on tie, but real signals push it higher.
      let s = 1;
      if (/\bidea\b|\bconcept\b|\bstart\w*/i.test(t)) s += 2;
      if (/\bvalidation\b|\binterview\b|\bwaitlist\b/i.test(t)) s += 2;
      if (/\bproblem\b|\bcustomer\b/i.test(t)) s += 1;
      return s;
    },
  },
  {
    key: "cap_table",
    label: "Set up your Cap Table",
    href: "/tools/cap-table",
    rationaleTemplate: () =>
      "You mentioned co-founders or equity splits — lock the ownership structure before you raise or hire.",
    score: (t) => {
      let s = 0;
      if (/\bco.?founder\b|\bequity\b|\bshare\b|\bshareholder\b/i.test(t)) s += 4;
      if (/\bvesting\b|\besop\b|\bcap\s*table\b/i.test(t)) s += 4;
      if (/\bdilution\b/i.test(t)) s += 2;
      return s;
    },
  },
  {
    key: "esic",
    label: "Check ESIC Eligibility",
    href: "/tools/esic",
    rationaleTemplate: () =>
      "R&D, IP, or early-stage signals suggest ESIC status could unlock 20% tax offset + CGT exemption for your investors.",
    score: (t) => {
      let s = 0;
      if (/\br&?d\b|\bresearch\b|\bpatent\b|\bip\b|\binnovation\b/i.test(t)) s += 3;
      if (/\btax\s*offset\b|\besic\b|\bearly.stage\b/i.test(t)) s += 5;
      if (/\bincorporated\b|\bfy\d\d\b/i.test(t)) s += 1;
      return s;
    },
  },
  {
    key: "fundraise",
    label: "Prepare Fundraise Materials",
    href: "/workspace/fundraise",
    rationaleTemplate: () =>
      "You're actively raising — build the deck, financial model, and data room in one workspace.",
    score: (t) => {
      let s = 0;
      if (/\braise\b|\braising\b|\bseed\b|\bpre.seed\b|\bsafe\b|\bterm\s*sheet\b/i.test(t)) s += 4;
      if (/\bpitch\s*deck\b|\bdata\s*room\b|\bfinancial\s*model\b/i.test(t)) s += 3;
      if (/\binvestor\b|\bvc\b|\bangel\b/i.test(t)) s += 2;
      return s;
    },
  },
  {
    key: "team",
    label: "Build your Team & ESOP",
    href: "/workspace/team",
    rationaleTemplate: () =>
      "You need to bring on people — set up hiring, ESOP allocation, and vesting before offers go out.",
    score: (t) => {
      let s = 0;
      if (/\bhire\b|\bhiring\b|\brecruit\b/i.test(t)) s += 3;
      if (/\besop\b|\boptions\b|\bequity\s*grant\b/i.test(t)) s += 3;
      if (/\bsolo\b|\bneed\s+a\s+(cto|coo|cmo)\b|\bteam\s+gap\b/i.test(t)) s += 2;
      return s;
    },
  },
  {
    key: "idea_valuation",
    label: "Estimate Idea Valuation",
    href: "/tools/idea-valuation",
    rationaleTemplate: ({ sectorLabel }) =>
      sectorLabel
        ? `Get a quick AUD range for your ${sectorLabel} idea before deciding on the next step.`
        : "Get a quick AUD range for your idea before committing to a full report.",
    score: (t) => {
      let s = 0;
      if (/\bvaluation\b|\bworth\b|\bhow\s*much\b/i.test(t)) s += 3;
      if (/\bprice\b|\bmarket\s*size\b|\btam\b/i.test(t)) s += 1;
      return s;
    },
  },
];

export function synthesizeRecommendation(
  ideaText: string,
  answers: Record<string, string>,
): Recommendation {
  const idea = (ideaText ?? "").slice(0, 4000);
  const answerBlob = Object.values(answers ?? {}).join(" \n ").slice(0, 8000);
  const combined = `${idea} \n ${answerBlob}`.toLowerCase();

  const sector = detectSector(combined);
  const sectorLabel = sector ? SECTOR_LABELS[sector] : undefined;

  const ranked = DESTINATIONS
    .map((d) => ({ dest: d, score: d.score(combined) }))
    .sort((a, b) => b.score - a.score);

  const primary = ranked[0]!.dest;
  const scoredSecondaries = ranked.slice(1).filter((r) => r.score > 0);
  // Fall back to the next two ranked destinations even at score 0 so the
  // recommendation card always shows the founder at least one alternative
  // path to explore — an empty secondaryFeatures array reads as "nothing
  // else on offer" and kills onward navigation.
  const chosenSecondaries = scoredSecondaries.length > 0
    ? scoredSecondaries.slice(0, 3)
    : ranked.slice(1, 3);
  const secondaries = chosenSecondaries.map((r) => ({
    label: r.dest.label,
    href: r.dest.href,
  }));

  return {
    primaryFeature: primary.label,
    primaryFeatureHref: primary.href,
    rationale: primary.rationaleTemplate({ sectorLabel }),
    secondaryFeatures: secondaries,
  };
}
