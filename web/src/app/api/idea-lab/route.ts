import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { canAfford, spendCredits, FEATURE_COSTS } from "@/lib/credits";
import { getProjectIdFromRequest } from "@/lib/projects";
import { SECTOR_LABELS } from "@/lib/svi-analysis";
import { generateIdeaLab, type Audience, type IdeaLabRequest } from "@/lib/agents/rnd-idea-lab";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// POST /api/idea-lab
// Body: { sector: string; problemArea: string; audience?: Audience }
//
// - Anonymous callers get one call per (IP + sector) per day via the shared
//   `default` rate-limit bucket. They still receive real data — no login wall
//   because the value is in exploration.
// - Logged-in callers are credit-gated (`idea_lab`) and share the same bucket
//   scoped to their user id so heavy usage doesn't fall back onto their IP
//   pool for other tools.
// - The endpoint NEVER 500s on AI failure — the agent falls back to the
//   deterministic seed automatically.
// ---------------------------------------------------------------------------

const MAX_PROBLEM_LEN = 500;
const MAX_SECTOR_LEN = 60;
const ALLOWED_AUDIENCES: Audience[] = ["consumer", "smb", "enterprise", "any"];

function ipFromRequest(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "anon"
  );
}

function isAudience(v: unknown): v is Audience {
  return typeof v === "string" && (ALLOWED_AUDIENCES as readonly string[]).includes(v);
}

export async function POST(request: Request) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const raw = (body as Record<string, unknown>) ?? {};
  const sectorInput = typeof raw.sector === "string" ? raw.sector.trim().toLowerCase() : "";
  const problemInput = typeof raw.problemArea === "string" ? raw.problemArea.trim() : "";
  const audience: Audience = isAudience(raw.audience) ? raw.audience : "any";

  if (!sectorInput || sectorInput.length > MAX_SECTOR_LEN) {
    return NextResponse.json(
      { ok: false, error: "`sector` is required (max 60 chars)." },
      { status: 400 },
    );
  }
  if (problemInput.length > MAX_PROBLEM_LEN) {
    return NextResponse.json(
      { ok: false, error: `\`problemArea\` must be <= ${MAX_PROBLEM_LEN} characters.` },
      { status: 400 },
    );
  }

  // We do not require the sector to be in SECTOR_LABELS — free-form input is
  // allowed — but we surface the canonical label when we recognise the key.
  const sectorLabel = SECTOR_LABELS[sectorInput] ?? sectorInput;

  const user = await getCurrentUser();
  const identity = user?.id ?? ipFromRequest(request);

  // Rate-limit — shared `default` bucket keyed by identity + sector so the
  // "same sector twice in a row" case does not lock out other tools.
  const rl = await checkRateLimit("default", ["idea-lab", identity, sectorInput]);
  if (!rl.allowed) {
    const secs = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
    return NextResponse.json(
      { ok: false, error: "Too many requests — try again shortly.", retryInSeconds: secs },
      { status: 429, headers: { "Retry-After": String(secs) } },
    );
  }

  // Anonymous callers get a stricter once-per-day-per-(IP + sector) ceiling —
  // exploratory tool, not a public firehose. Logged-in users are credit-gated
  // and skip this bucket.
  if (!user) {
    const anonKey = `idea-lab-anon:${identity}:${sectorInput}`;
    const anonRl = checkRateLimit(anonKey, 1, 24 * 60 * 60_000);
    if (!anonRl.allowed) {
      const secs = Math.max(1, Math.ceil(anonRl.resetIn / 1000));
      return NextResponse.json(
        {
          ok: false,
          error: "Free tier: one Idea Lab request per sector per day. Sign in for unlimited runs (credit-gated).",
          retryInSeconds: secs,
        },
        { status: 429, headers: { "Retry-After": String(secs) } },
      );
    }
  }

  // Credit gate for logged-in callers.
  let creditsCharged = 0;
  if (user) {
    const affordCheck = await canAfford(user.id, "idea_lab");
    if (!affordCheck.allowed) {
      const cost = FEATURE_COSTS.idea_lab ?? 3;
      return NextResponse.json(
        {
          ok: false,
          error: "Insufficient credits.",
          creditsRequired: cost,
          balance: affordCheck.balance,
        },
        { status: 402 },
      );
    }

    const projectId = await getProjectIdFromRequest();
    const spend = await spendCredits(user.id, "idea_lab", {
      sector: sectorInput,
      problemArea: problemInput.slice(0, 120),
      audience,
      project_id: projectId,
    });
    if (!spend.ok) {
      const cost = FEATURE_COSTS.idea_lab ?? 3;
      return NextResponse.json(
        {
          ok: false,
          error: "Could not deduct credits — please retry.",
          creditsRequired: cost,
          balance: spend.balance,
        },
        { status: 402 },
      );
    }
    creditsCharged = affordCheck.cost;
  }

  const reqPayload: IdeaLabRequest = {
    sector: sectorInput,
    problemArea: problemInput,
    audience,
  };

  try {
    const result = await generateIdeaLab(reqPayload);
    return NextResponse.json({
      ok: true,
      ...result,
      sectorLabel, // preserve canonical label for the client
      creditsCharged,
      disclaimer: "Ideas provided for exploration only. Not investment advice.",
    });
  } catch (err) {
    // generateIdeaLab is engineered never to throw — but if something entirely
    // unexpected happens, still return the seed rather than a 500.
    console.error("[api:idea-lab] unexpected error", err);
    const { getSeed } = await import("@/lib/agents/rnd-idea-lab-seed");
    const seed = getSeed(sectorInput);
    return NextResponse.json({
      ok: true,
      sector: sectorInput,
      sectorLabel,
      angles: seed.angles,
      nonObvious: seed.nonObvious,
      competitors: seed.competitors,
      generatedAt: new Date().toISOString(),
      source: "seed" as const,
      creditsCharged,
      disclaimer: "Ideas provided for exploration only. Not investment advice.",
    });
  }
}
