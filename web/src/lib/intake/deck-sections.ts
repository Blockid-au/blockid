// Deck section splitter — classifies pitch-deck slides into standard sections.
//
// Keyword/regex fast-path per slide title; unclassified slides are batched
// into ONE Haiku call for LLM classification. Zero-slide input returns an
// empty structure — callers should treat that as a signal to fall back to
// OCR or ask the founder to re-upload.

import "server-only";

import { callAI } from "@/lib/ai-client";

export interface DeckSections {
  problem: string[];
  solution: string[];
  market: string[];
  product: string[];
  traction: string[];
  team: string[];
  ask: string[];
  other: string[];
}

type SectionKey = keyof DeckSections;

const KEYWORD_MAP: Array<[SectionKey, RegExp]> = [
  ["problem", /\b(problem|pain\s*point|challenge|status quo|why now)\b/i],
  ["solution", /\b(solution|how it works|our approach|the answer|introducing)\b/i],
  ["market", /\b(market|opportunity|tam|sam|som|size of prize|addressable market)\b/i],
  ["product", /\b(product|features|demo|screenshot|platform|technology|architecture|roadmap)\b/i],
  ["traction", /\b(traction|revenue|users|growth|customers|kpi|metrics|milestones|arr|mrr)\b/i],
  ["team", /\b(team|founders?|advisors?|about us|leadership|who we are)\b/i],
  ["ask", /\b(ask|raise|funding|use of funds|contact|thank you|next steps|invest|round)\b/i],
];

function classifyByKeyword(slide: string): SectionKey | null {
  const firstLine = slide.split(/\n/).map(l => l.trim()).find(l => l.length > 0) ?? "";
  const header = firstLine.slice(0, 100);
  for (const [key, re] of KEYWORD_MAP) {
    if (re.test(header)) return key;
  }
  // Try a broader match on the first 200 chars if header didn't hit
  const preview = slide.slice(0, 200);
  for (const [key, re] of KEYWORD_MAP) {
    if (re.test(preview)) return key;
  }
  return null;
}

async function batchClassifyWithLlm(
  unclassified: Array<{ index: number; text: string }>,
): Promise<Map<number, SectionKey>> {
  const results = new Map<number, SectionKey>();
  if (unclassified.length === 0) return results;

  const enumerated = unclassified
    .map((s, i) => `[${i}] ${s.text.slice(0, 240).replace(/\s+/g, " ")}`)
    .join("\n");

  const system = [
    "You classify pitch-deck slide text into ONE of these buckets: problem, solution, market, product, traction, team, ask, other.",
    "Return ONLY JSON of the shape {\"assignments\":[{\"idx\":<number>,\"bucket\":\"<name>\"}]}",
    "Only include entries you are confident about; skip ambiguous ones.",
  ].join("\n");

  try {
    const res = await callAI({
      system,
      user: `Slides:\n${enumerated}`,
      maxTokens: 400,
      temperature: 0,
      agentId: "deck-section-classifier",
    });
    const match = res.text.match(/\{[\s\S]*\}/);
    if (!match) return results;
    const parsed = JSON.parse(match[0]) as {
      assignments?: Array<{ idx: number; bucket: string }>;
    };
    for (const a of parsed.assignments ?? []) {
      if (typeof a.idx !== "number") continue;
      const bucket = a.bucket as SectionKey;
      if (!["problem", "solution", "market", "product", "traction", "team", "ask", "other"].includes(bucket)) continue;
      const original = unclassified[a.idx];
      if (!original) continue;
      results.set(original.index, bucket);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[intake:deck-sections] LLM batch classify failed", msg);
  }
  return results;
}

export async function splitDeckToSections(
  slides: string[],
): Promise<DeckSections> {
  const out: DeckSections = {
    problem: [],
    solution: [],
    market: [],
    product: [],
    traction: [],
    team: [],
    ask: [],
    other: [],
  };

  const assignments = new Map<number, SectionKey>();
  const unclassified: Array<{ index: number; text: string }> = [];

  slides.forEach((slide, index) => {
    const bucket = classifyByKeyword(slide);
    if (bucket) {
      assignments.set(index, bucket);
    } else {
      unclassified.push({ index, text: slide });
    }
  });

  // Batch unclassified into ONE Haiku call, capped so we never pay for
  // ridiculous decks.
  if (unclassified.length > 0 && unclassified.length <= 40) {
    const llmAssignments = await batchClassifyWithLlm(unclassified);
    for (const [i, bucket] of llmAssignments) {
      assignments.set(i, bucket);
    }
  }

  slides.forEach((slide, index) => {
    const bucket = assignments.get(index) ?? "other";
    out[bucket].push(slide);
  });

  return out;
}
