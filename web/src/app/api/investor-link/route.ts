import { NextResponse } from "next/server";
import { createInvestorLink } from "@/lib/investor-links";
import { isSupabaseConfigured } from "@/lib/supabase";

// POST /api/investor-link
// Body: {
//   scoreId: string,         // existing score slug
//   founderEmail: string,    // must match scores.email — proves ownership
//   investorEmail?: string,
//   investorName?: string,
//   fundName?: string,
//   note?: string,
// }
//
// Returns: { ok, token, url } where url is /s/i/<token>.
//
// Auth note: until proper accounts ship, ownership is enforced by matching
// founderEmail against the score's recorded email server-side. This is weaker
// than a session, but the "lookup-then-insert" pattern in createInvestorLink
// rejects mismatches with a 404-equivalent (score_not_found).

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Per-investor links require Supabase. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      },
      { status: 503 },
    );
  }

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = body as {
    scoreId?: unknown;
    founderEmail?: unknown;
    investorEmail?: unknown;
    investorName?: unknown;
    fundName?: unknown;
    note?: unknown;
  } | null;

  const scoreId = typeof parsed?.scoreId === "string" ? parsed.scoreId.trim() : "";
  const founderEmail =
    typeof parsed?.founderEmail === "string" ? parsed.founderEmail.trim() : "";
  if (!scoreId) {
    return NextResponse.json(
      { ok: false, error: "scoreId is required" },
      { status: 400 },
    );
  }
  if (!founderEmail || !founderEmail.includes("@")) {
    return NextResponse.json(
      { ok: false, error: "founderEmail is required" },
      { status: 400 },
    );
  }

  const investorEmail =
    typeof parsed?.investorEmail === "string" && parsed.investorEmail.trim()
      ? parsed.investorEmail.trim()
      : null;
  if (investorEmail && !investorEmail.includes("@")) {
    return NextResponse.json(
      { ok: false, error: "investorEmail must be a valid email" },
      { status: 400 },
    );
  }

  const result = await createInvestorLink({
    scoreId,
    investorEmail,
    investorName:
      typeof parsed?.investorName === "string" && parsed.investorName.trim()
        ? parsed.investorName.trim().slice(0, 200)
        : null,
    fundName:
      typeof parsed?.fundName === "string" && parsed.fundName.trim()
        ? parsed.fundName.trim().slice(0, 200)
        : null,
    note:
      typeof parsed?.note === "string" && parsed.note.trim()
        ? parsed.note.trim().slice(0, 1000)
        : null,
    createdByEmail: founderEmail,
  });

  if (!result.ok) {
    if (result.reason === "score_not_found") {
      return NextResponse.json(
        { ok: false, error: "Score not found or email does not match." },
        { status: 404 },
      );
    }
    if (result.reason === "not_configured") {
      return NextResponse.json(
        { ok: false, error: "Storage not configured." },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "Could not create investor link." },
      { status: 500 },
    );
  }

  const url = `${siteUrl()}/s/i/${result.link.token}`;
  return NextResponse.json({
    ok: true,
    token: result.link.token,
    url,
    investorEmail: result.link.investorEmail,
    investorName: result.link.investorName,
    fundName: result.link.fundName,
    createdAt: result.link.createdAt,
  });
}

export const dynamic = "force-dynamic";
