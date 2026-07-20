// src/app/api/financial-projections/route.ts
//
// POST /api/financial-projections
//
// Body (JSON):
//   {
//     sector: string,
//     startingMrrAud: number,
//     startingBurnAud: number,
//     founderCount: number,
//     startDate: string (YYYY-MM-DD),
//     scenario: "aggressive" | "moderate" | "conservative",
//     includeTaxIncentives: boolean
//   }
//
// Query string:
//   ?format=csv  → responds text/csv with a download filename.
//
// - Auth OPTIONAL. Logged-in users are credit-gated (feature key
//   "financial_projections", cost 2 credits — see src/lib/credits.ts).
// - Rate-limited via checkRateLimit("default", ["financial-projections", identity]).
// - Deterministic — the underlying generator has no clock / RNG dependency.
// - AFSL disclaimer is included in every response payload.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { canAfford, spendCredits, FEATURE_COSTS } from "@/lib/credits";
import { VC_BENCHMARKS } from "@/lib/agents/cfo-valuation";
import {
  generateProjection,
  projectionToCsv,
  isProjectionScenario,
  type ProjectionInput,
} from "@/lib/financial-projections";

export const dynamic = "force-dynamic";

const MAX_AMOUNT_AUD = 1_000_000_000; // hard cap on any dollar input
const MAX_FOUNDERS = 50;
const AFSL_DISCLAIMER =
  "General information only. Not financial advice. Projections are illustrative estimates.";
const FEATURE_KEY = "financial_projections";

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

function isFinitePositiveInt(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && Number.isInteger(v);
}

/** Accept YYYY-MM-DD (with optional time component). Return null on invalid. */
function normaliseDate(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (!match) return null;
  const y = Number.parseInt(match[1], 10);
  const m = Number.parseInt(match[2], 10);
  const d = Number.parseInt(match[3], 10);
  if (y < 1970 || y > 2100) return null;
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > 31) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

interface ValidatedInput { input: ProjectionInput }
type ValidationError = { error: string };

function validate(raw: Record<string, unknown>): ValidatedInput | ValidationError {
  const sector = typeof raw.sector === "string" ? raw.sector.trim().toLowerCase() : "";
  if (!sector) return { error: "`sector` is required." };
  // We allow unknown sector strings (they normalise to "default" inside the
  // engine) but reject empty / non-string values here to give a nicer error.

  if (!isFiniteNonNegative(raw.startingMrrAud) || raw.startingMrrAud > MAX_AMOUNT_AUD) {
    return { error: "`startingMrrAud` must be a non-negative number up to 1e9." };
  }
  if (!isFiniteNonNegative(raw.startingBurnAud) || raw.startingBurnAud > MAX_AMOUNT_AUD) {
    return { error: "`startingBurnAud` must be a non-negative number up to 1e9." };
  }
  if (!isFinitePositiveInt(raw.founderCount) || raw.founderCount > MAX_FOUNDERS) {
    return { error: `\`founderCount\` must be an integer between 0 and ${MAX_FOUNDERS}.` };
  }
  const date = normaliseDate(raw.startDate);
  if (!date) return { error: "`startDate` must be a valid ISO date (YYYY-MM-DD)." };
  if (!isProjectionScenario(raw.scenario)) {
    return { error: "`scenario` must be aggressive, moderate, or conservative." };
  }
  const includeTaxIncentives = raw.includeTaxIncentives === true;

  return {
    input: {
      sector,
      startingMrrAud: raw.startingMrrAud,
      startingBurnAud: raw.startingBurnAud,
      founderCount: raw.founderCount,
      startDate: date,
      scenario: raw.scenario,
      includeTaxIncentives,
    },
  };
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

  const user = await getCurrentUser();
  const identity = user?.id ?? ipFromRequest(request);

  const rl = await checkRateLimit("default", ["financial-projections", identity]);
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

  // Credit gate for logged-in users only. Anonymous callers get the tool free
  // (subject to the shared rate-limit bucket above).
  let creditsCharged = 0;
  let creditsRemaining: number | null = null;
  if (user) {
    const afford = await canAfford(user.id, FEATURE_KEY);
    if (!afford.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: "Insufficient credits.",
          creditsRequired: FEATURE_COSTS[FEATURE_KEY] ?? 2,
          balance: afford.balance,
          disclaimer: AFSL_DISCLAIMER,
        },
        { status: 402 },
      );
    }
    const spend = await spendCredits(user.id, FEATURE_KEY, {
      sector: validated.input.sector,
      scenario: validated.input.scenario,
    });
    if (!spend.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "Could not deduct credits — please retry.",
          creditsRequired: FEATURE_COSTS[FEATURE_KEY] ?? 2,
          balance: spend.balance,
          disclaimer: AFSL_DISCLAIMER,
        },
        { status: 402 },
      );
    }
    creditsCharged = afford.cost;
    creditsRemaining = spend.balance;
  }

  const projection = generateProjection(validated.input);

  // ?format=csv — return CSV instead of JSON. Credits are still spent above
  // (fair — the CSV is the same computed output, just serialised differently).
  const url = new URL(request.url);
  if (url.searchParams.get("format") === "csv") {
    const csv = projectionToCsv(projection);
    const filename = `financial-projections-${validated.input.sector}-${validated.input.scenario}-${validated.input.startDate}.csv`;
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return NextResponse.json({
    ok: true,
    projection,
    creditsCharged,
    creditsRemaining,
    knownSectors: Object.keys(VC_BENCHMARKS),
    disclaimer: AFSL_DISCLAIMER,
  });
}
