import "server-only";

// ---------------------------------------------------------------------------
// R&D Idea Lab agent — sector-aware startup-angle generator.
//
// Given a sector + broad problem area, returns 10 concrete startup angles,
// 5 non-obvious opportunities in adjacent spaces, and 3 real AU competitors
// worth knowing about. Wired through the shared free-model AI chain so we
// prefer $0-cost providers, cap output tokens (~1500) and always fall back
// to the deterministic seed if the AI is unavailable — the endpoint must
// never 500.
// ---------------------------------------------------------------------------

import { callAI } from "@/lib/ai-client";
import { SECTOR_LABELS } from "@/lib/svi-analysis";
import { getSeed } from "./rnd-idea-lab-seed";

// ── Types ──────────────────────────────────────────────────────────────

export type Audience = "consumer" | "smb" | "enterprise" | "any";

export interface IdeaLabRequest {
  sector: string;
  problemArea: string;
  audience?: Audience;
}

export interface StartupAngle {
  title: string;
  oneLiner: string;
  targetCustomer: string;
  monetisation: string;
  effortLevel: "low" | "medium" | "high";
}

export interface NonObviousOpportunity {
  title: string;
  whyOverlooked: string;
  hookForFounder: string;
}

export interface CompetitorNote {
  name: string;
  whatTheyDo: string;
  angle: string;
}

export interface IdeaLabResponse {
  sector: string;
  sectorLabel: string;
  angles: StartupAngle[];
  nonObvious: NonObviousOpportunity[];
  competitors: CompetitorNote[];
  generatedAt: string;
  /** "ai" if the LLM answered, "seed" if we fell back to the deterministic seed. */
  source: "ai" | "seed";
  /** Populated when source = "ai" so the API can log which model answered. */
  model?: string;
  provider?: string;
}

// ── Constants ──────────────────────────────────────────────────────────

const MAX_PROBLEM_LEN = 500;
const MAX_TOKENS = 1500;
const AI_TIMEOUT_MS = 45_000;

const AUDIENCE_HINT: Record<Audience, string> = {
  consumer: "Prioritise consumer-facing (B2C) angles — everyday Australians as end users.",
  smb: "Prioritise Australian SMB customers (5-200 employees).",
  enterprise: "Prioritise enterprise or mid-market AU buyers with 500+ employees or regulated procurement.",
  any: "Include a healthy mix of consumer, SMB, and enterprise angles.",
};

// ── Prompt ─────────────────────────────────────────────────────────────

function buildPrompt(req: IdeaLabRequest, sectorLabel: string): { system: string; user: string } {
  const audience: Audience = req.audience ?? "any";
  const problem = req.problemArea.slice(0, MAX_PROBLEM_LEN).trim();

  const system =
    "You are an Australian startup R&D analyst. You produce concrete, buildable startup " +
    "angles for a given sector and problem area. You favour Australian market context " +
    "(AU regulators, buyers, competitors). You NEVER invent competitors that do not exist. " +
    "You reply ONLY with a single JSON object matching the schema the user requests — no " +
    "markdown, no preamble, no commentary.";

  const user = `Sector: ${sectorLabel} (${req.sector})
Problem area: ${problem || "(open-ended — pick the most interesting angles)"}
Audience preference: ${audience}
${AUDIENCE_HINT[audience]}

Return JSON matching this exact schema (no extra keys):

{
  "angles": [ // exactly 10
    {
      "title": "short, distinctive product name idea (max 6 words)",
      "oneLiner": "single sentence describing the product (max 30 words)",
      "targetCustomer": "specific AU customer segment",
      "monetisation": "pricing model + realistic AUD amounts",
      "effortLevel": "low" | "medium" | "high"
    }
  ],
  "nonObvious": [ // exactly 5
    {
      "title": "short opportunity name",
      "whyOverlooked": "one sentence on why founders miss it",
      "hookForFounder": "one sentence describing what to build"
    }
  ],
  "competitors": [ // exactly 3
    {
      "name": "REAL Australian company name (or global company operating in AU)",
      "whatTheyDo": "one-sentence description of their product",
      "angle": "one sentence on their moat or unique angle"
    }
  ]
}

Rules:
- Reply with the raw JSON object only. No code fences, no prose before or after.
- All angles must be plausible to launch in Australia within 12 months.
- Use Australian English spelling ("monetisation", not "monetization").
- Prefer specific AU regulators / programs (ATO, ASIC, TGA, AUSTRAC, MBS, NDIS) when relevant.
- Every angle title must be different — no duplicates or near-duplicates.
- Only list competitors you are confident actually exist and operate in this sector.`;

  return { system, user };
}

// ── JSON extraction + validation ──────────────────────────────────────

function extractJSON(raw: string): unknown {
  const trimmed = raw.trim();
  // Strip common code fence wrappers.
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    // Try to find the first {…} block.
    const braceStart = candidate.indexOf("{");
    const braceEnd = candidate.lastIndexOf("}");
    if (braceStart >= 0 && braceEnd > braceStart) {
      try {
        return JSON.parse(candidate.slice(braceStart, braceEnd + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function isString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function coerceEffort(v: unknown): StartupAngle["effortLevel"] {
  if (v === "low" || v === "medium" || v === "high") return v;
  return "medium";
}

function validateAngle(v: unknown): StartupAngle | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  if (!isString(r.title) || !isString(r.oneLiner) || !isString(r.targetCustomer) || !isString(r.monetisation)) return null;
  return {
    title: r.title.slice(0, 120),
    oneLiner: r.oneLiner.slice(0, 400),
    targetCustomer: r.targetCustomer.slice(0, 200),
    monetisation: r.monetisation.slice(0, 200),
    effortLevel: coerceEffort(r.effortLevel),
  };
}

function validateNonObvious(v: unknown): NonObviousOpportunity | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  if (!isString(r.title) || !isString(r.whyOverlooked) || !isString(r.hookForFounder)) return null;
  return {
    title: r.title.slice(0, 120),
    whyOverlooked: r.whyOverlooked.slice(0, 300),
    hookForFounder: r.hookForFounder.slice(0, 300),
  };
}

function validateCompetitor(v: unknown): CompetitorNote | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  if (!isString(r.name) || !isString(r.whatTheyDo) || !isString(r.angle)) return null;
  return {
    name: r.name.slice(0, 100),
    whatTheyDo: r.whatTheyDo.slice(0, 300),
    angle: r.angle.slice(0, 300),
  };
}

interface ParsedAIResult {
  angles: StartupAngle[];
  nonObvious: NonObviousOpportunity[];
  competitors: CompetitorNote[];
}

function parseAIResult(raw: string): ParsedAIResult | null {
  const parsed = extractJSON(raw);
  if (!parsed || typeof parsed !== "object") return null;
  const r = parsed as Record<string, unknown>;

  const anglesRaw = Array.isArray(r.angles) ? r.angles : [];
  const nonObvRaw = Array.isArray(r.nonObvious) ? r.nonObvious : [];
  const compRaw = Array.isArray(r.competitors) ? r.competitors : [];

  const angles = anglesRaw.map(validateAngle).filter((a): a is StartupAngle => a !== null).slice(0, 10);
  const nonObvious = nonObvRaw.map(validateNonObvious).filter((n): n is NonObviousOpportunity => n !== null).slice(0, 5);
  const competitors = compRaw.map(validateCompetitor).filter((c): c is CompetitorNote => c !== null).slice(0, 3);

  // Minimum shape thresholds — anything less means the model returned junk
  // and we should retry / fall back rather than surface a half-empty payload.
  if (angles.length < 6 || nonObvious.length < 3 || competitors.length < 2) return null;
  return { angles, nonObvious, competitors };
}

// ── Public entry point ────────────────────────────────────────────────

export async function generateIdeaLab(req: IdeaLabRequest): Promise<IdeaLabResponse> {
  const sectorKey = (req.sector || "").toLowerCase().trim();
  const sectorLabel = SECTOR_LABELS[sectorKey] ?? req.sector ?? "General";
  const generatedAt = new Date().toISOString();

  const seed = getSeed(sectorKey);

  const prompt = buildPrompt({ ...req, sector: sectorKey || "general" }, sectorLabel);

  // Try the AI once, then a single retry on parse failure.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await callAI({
        system: prompt.system,
        user: attempt === 0
          ? prompt.user
          : `${prompt.user}\n\nYour previous reply was not valid JSON. Reply ONLY with the raw JSON object — no fences, no prose.`,
        maxTokens: MAX_TOKENS,
        timeoutMs: AI_TIMEOUT_MS,
      });

      const parsed = parseAIResult(result.text);
      if (parsed) {
        console.log(`[idea-lab] AI hit sector=${sectorKey} provider=${result.provider} model=${result.model} attempt=${attempt + 1}`);
        return {
          sector: sectorKey,
          sectorLabel,
          angles: parsed.angles,
          nonObvious: parsed.nonObvious,
          competitors: parsed.competitors,
          generatedAt,
          source: "ai",
          model: result.model,
          provider: result.provider,
        };
      }
      console.warn(`[idea-lab] AI parse failed sector=${sectorKey} attempt=${attempt + 1} — retrying`);
    } catch (err) {
      console.warn(`[idea-lab] AI call failed sector=${sectorKey} attempt=${attempt + 1}: ${err instanceof Error ? err.message : err}`);
      // On the second attempt failure we fall through to seed.
    }
  }

  console.warn(`[idea-lab] falling back to seed sector=${sectorKey}`);
  return {
    sector: sectorKey,
    sectorLabel,
    angles: seed.angles,
    nonObvious: seed.nonObvious,
    competitors: seed.competitors,
    generatedAt,
    source: "seed",
  };
}
