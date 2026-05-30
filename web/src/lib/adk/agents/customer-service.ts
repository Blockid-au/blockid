// Customer Service — a port of Google Agent Garden's `customer-service`
// sample (the one already shipped in TypeScript) onto our free ADK-style layer.
//
// The original automates support: understand the user's request, answer from
// product knowledge, and decide when to escalate to a human. We adapt it to
// BlockID's customer-success use case. A SequentialAgent runs
//   triage_agent → response_agent
// to classify the query, draft a grounded answer, and flag escalations.
//
// Runs on the injected free `ModelCaller` — $0, no Gemini, no GCP. Returns a
// safe fallback on error so a support endpoint never hard-fails.

import { LlmAgent, SequentialAgent, newSession, type ModelCaller } from "@/lib/adk";

// Product knowledge the response agent is allowed to ground answers in. Keep
// this short and factual — it is injected into the prompt, not invented.
const BLOCKID_KB = `BlockID.au — Australian AI startup valuation platform.
- Core product: Startup Value Index (SVI), a 0-100 evidence-backed score across 13 criteria.
- Outputs: dollar valuation, multi-agent reports (Standard/Premium/Investor Memo), cap table, equity & tokenization tools.
- Pricing: free SVI score; paid reports cost credits (shown before purchase).
- Audience: Australian founders, pre-seed to Series A. Context: ASIC, ATO, ESIC, AUD.
- Account: users sign in by email; data is per-project.`;

const TRIAGE_INSTRUCTION = `You are a customer-support triage agent for BlockID.au.

Classify the user's message. Output EXACTLY:
CATEGORY: <one of: billing | technical | product_how_to | valuation_question | account | feedback | other>
SENTIMENT: <positive | neutral | negative>
ESCALATE: <yes | no>   (yes only for: refunds, billing disputes, data/privacy/security incidents, legal threats, or clear anger)`;

const RESPONSE_INSTRUCTION = `You are a friendly, concise customer-success agent for BlockID.au.

Product knowledge (the ONLY facts you may rely on):
${BLOCKID_KB}

Triage of this message:
{triage}

Write a helpful reply to the user.
Rules:
- Be warm, specific, and brief (2-5 sentences).
- Only state facts from the product knowledge above. If you don't know, say you'll connect them with the team.
- If the triage says ESCALATE: yes, acknowledge the issue and tell them you're escalating to a human specialist.
- Where useful, point to the relevant BlockID feature (SVI score, reports, cap table).
- Never invent pricing, numbers, or features.

Output ONLY the reply text.`;

export type SupportCategory =
  | "billing"
  | "technical"
  | "product_how_to"
  | "valuation_question"
  | "account"
  | "feedback"
  | "other";

export interface SupportResult {
  category: SupportCategory;
  sentiment: "positive" | "neutral" | "negative";
  escalate: boolean;
  reply: string;
}

const triageAgent = new LlmAgent({
  name: "triage_agent",
  description: "Classifies support messages and flags escalations.",
  instruction: TRIAGE_INSTRUCTION,
  maxTokens: 120,
  outputKey: "triage",
});

const responseAgent = new LlmAgent({
  name: "response_agent",
  description: "Drafts a grounded support reply.",
  instruction: RESPONSE_INSTRUCTION,
  maxTokens: 500,
});

/**
 * Handle a customer-support query: triage → grounded reply. Runs on the free
 * model chain. Fail-safe: returns a polite escalation fallback on error.
 */
export async function handleSupportQuery(
  message: string,
  model: ModelCaller,
): Promise<SupportResult> {
  const fallback: SupportResult = {
    category: "other",
    sentiment: "neutral",
    escalate: true,
    reply:
      "Thanks for reaching out! Our team will follow up with you shortly. In the meantime, you can explore your free Startup Value Index on BlockID.au.",
  };

  if (!message.trim()) return fallback;

  try {
    const session = newSession();
    const seq = new SequentialAgent("customer_service", [triageAgent, responseAgent]);
    const trace = await seq.run(message, session, model);

    const triage = session.state.triage ?? "";
    const reply = (trace[trace.length - 1]?.output ?? "").trim();

    return {
      category: parseCategory(triage),
      sentiment: parseSentiment(triage),
      escalate: /ESCALATE:\s*yes/i.test(triage),
      reply: reply || fallback.reply,
    };
  } catch {
    return fallback;
  }
}

// ── Parsing helpers ───────────────────────────────────────────────────────────

const CATEGORIES: SupportCategory[] = [
  "billing",
  "technical",
  "product_how_to",
  "valuation_question",
  "account",
  "feedback",
  "other",
];

function parseCategory(triage: string): SupportCategory {
  const m = triage.match(/CATEGORY:\s*([a-z_]+)/i);
  const val = m?.[1]?.toLowerCase() as SupportCategory | undefined;
  return val && CATEGORIES.includes(val) ? val : "other";
}

function parseSentiment(triage: string): "positive" | "neutral" | "negative" {
  const m = triage.match(/SENTIMENT:\s*(positive|neutral|negative)/i);
  return (m?.[1]?.toLowerCase() as "positive" | "neutral" | "negative") ?? "neutral";
}
