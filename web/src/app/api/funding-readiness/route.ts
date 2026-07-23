// src/app/api/funding-readiness/route.ts
//
// POST /api/funding-readiness
//
// Exposes the CRO funding-readiness scorer (CAPITAL framework, T0170) as a
// public tool endpoint so founders can self-check investor readiness from
// their own inputs without an SVI analysis in the database.
//
// Wraps the pure `scoreFundingReadiness` function in
// `src/lib/agents/cro-funding-readiness.ts` — no DB reads/writes, no auth,
// deterministic. Rate-limited via the shared `fundraise` bucket.

import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  scoreFundingReadiness,
  type FundingReadinessInput,
  type FundingStage,
} from "@/lib/agents/cro-funding-readiness";

export const dynamic = "force-dynamic";

const AFSL_DISCLAIMER =
  "General information only. Not financial advice. Score is illustrative and not a guarantee of investor interest.";

const VALID_STAGES: FundingStage[] = ["pre-seed", "seed", "series-a", "series-b"];

function ipFromRequest(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "anon"
  );
}

function isFiniteNonNegative(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

function optionalBool(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
}

function optionalNonNegative(v: unknown, max: number): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (!isFiniteNonNegative(v)) return undefined;
  return Math.min(v, max);
}

type ValidationError = { error: string };
type ValidatedInput = { input: FundingReadinessInput };

function validate(raw: Record<string, unknown>): ValidatedInput | ValidationError {
  const stageRaw = typeof raw.stage === "string" ? raw.stage.trim().toLowerCase() : "";
  const stage = VALID_STAGES.find((s) => s === stageRaw);
  if (!stage) {
    return { error: `\`stage\` must be one of: ${VALID_STAGES.join(", ")}.` };
  }

  const teamSignal = optionalNonNegative(raw.teamSignal, 100);
  const esopPoolPct = optionalNonNegative(raw.esopPoolPct, 100);
  const dataRoomPct = optionalNonNegative(raw.dataRoomPct, 100);
  const monthlyGrowthPct = optionalNonNegative(raw.monthlyGrowthPct, 500);

  const input: FundingReadinessInput = {
    stage,
    mrrAud: optionalNonNegative(raw.mrrAud, 1e9),
    users: optionalNonNegative(raw.users, 1e9),
    monthlyGrowthPct,
    teamSignal,
    hasTechnicalFounder: optionalBool(raw.hasTechnicalFounder),
    hasFounderVesting: optionalBool(raw.hasFounderVesting),
    hasShareholdersAgreement: optionalBool(raw.hasShareholdersAgreement),
    esopPoolPct,
    dataRoomPct,
    hasPitchDeck: optionalBool(raw.hasPitchDeck),
    hasFinancialModel: optionalBool(raw.hasFinancialModel),
    hasUseOfFunds: optionalBool(raw.hasUseOfFunds),
    hasWarmIntros: optionalBool(raw.hasWarmIntros),
  };

  return { input };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body", disclaimer: AFSL_DISCLAIMER },
      { status: 400 },
    );
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { ok: false, error: "Request body must be a JSON object.", disclaimer: AFSL_DISCLAIMER },
      { status: 400 },
    );
  }

  const validated = validate(body as Record<string, unknown>);
  if ("error" in validated) {
    return NextResponse.json(
      { ok: false, error: validated.error, disclaimer: AFSL_DISCLAIMER },
      { status: 400 },
    );
  }

  const identity = ipFromRequest(request);
  const rl = await checkRateLimit("fundraise", ["funding-readiness", identity]);
  if (!rl.allowed) {
    const secs = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
    return NextResponse.json(
      {
        ok: false,
        error: "Too many requests — try again shortly.",
        retryInSeconds: secs,
        disclaimer: AFSL_DISCLAIMER,
      },
      { status: 429, headers: { "Retry-After": String(secs) } },
    );
  }

  const result = scoreFundingReadiness(validated.input);

  return NextResponse.json({
    ok: true,
    result,
    disclaimer: AFSL_DISCLAIMER,
  });
}
