/**
 * POST /api/term-sheet
 *
 * Body: { termSheet: string, capTable?: Holder[] | null, round?: Round | null }
 *
 * Returns the structured Term Sheet AI analysis plus an optional dilution
 * diff (computed locally via @/lib/cap-table — we never ask the model to
 * compute share counts; it's worse at arithmetic than computeDiff()).
 *
 * The route degrades to demo mode if ANTHROPIC_API_KEY is missing or the
 * SDK throws — the founder funnel must not block on transient API issues.
 */
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { z } from "zod";
import { analyzeTermSheet } from "@/lib/term-sheet/analyze";

const HolderSchema = z.object({
  id: z.string(),
  name: z.string(),
  shares: z.number(),
  shareClass: z.enum(["common", "preferred", "esop", "safe"]),
  isFounder: z.boolean().optional(),
});

const RoundSchema = z.object({
  preMoneyAud: z.number(),
  raiseAud: z.number(),
  esopTopUpPct: z.number(),
  esopTimingPreMoney: z.boolean(),
  leadInvestorName: z.string(),
});

const BodySchema = z.object({
  termSheet: z
    .string()
    .min(100, "Term sheet too short — paste the full text (min 100 chars).")
    .max(30000, "Term sheet too long — paste up to 30,000 characters."),
  capTable: z.array(HolderSchema).nullable().optional(),
  round: RoundSchema.nullable().optional(),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, reason: "Authentication required" },
      { status: 401 },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      },
      { status: 400 },
    );
  }

  const { termSheet, capTable, round } = parsed.data;

  try {
    const result = await analyzeTermSheet({
      termSheet,
      capTable: capTable ?? null,
      round: round ?? null,
    });
    return NextResponse.json(
      {
        ok: true,
        mode: result.mode,
        analysis: result.analysis,
        dilution: result.dilution,
      },
      {
        status: 200,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (err) {
    console.error("[blockid:termsheet] Unhandled error in POST", err);
    return NextResponse.json(
      { ok: false, error: "Analysis failed" },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";
