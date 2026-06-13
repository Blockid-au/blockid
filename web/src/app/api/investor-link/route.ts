import { NextResponse } from "next/server";
import { createInvestorLink, listInvestorLinksForFounder, revokeInvestorLink } from "@/lib/investor-links";
import { getCurrentUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase";

// POST /api/investor-link
// Body: {
//   scoreId: string,           // existing svi_analyses id
//   investorEmail: string,     // required in v2
//   investorName?: string,
//   fundName?: string,
//   note?: string,
//   expiresAt?: string,        // ISO date string
// }
// Returns: { ok, token, slug, url, investorEmail, investorName, fundName, createdAt }

// GET /api/investor-link
// Returns: { ok, links: InvestorLink[] } — all links for the authenticated founder

// DELETE /api/investor-link?id=<token>
// Revokes a specific link owned by the authenticated founder.

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}

function notConfigured() {
  return NextResponse.json(
    {
      ok: false,
      error:
        "Per-investor links require Supabase. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    },
    { status: 503 },
  );
}

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: "Authentication required." },
    { status: 401 },
  );
}

// ---------------------------------------------------------------------------
// POST — create a new per-investor link
// ---------------------------------------------------------------------------
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return notConfigured();

  const user = await getCurrentUser();
  if (!user) return unauthorized();

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
    investorEmail?: unknown;
    investorName?: unknown;
    fundName?: unknown;
    note?: unknown;
    expiresAt?: unknown;
  } | null;

  const scoreId =
    typeof parsed?.scoreId === "string" ? parsed.scoreId.trim() : "";
  if (!scoreId) {
    return NextResponse.json(
      { ok: false, error: "scoreId is required" },
      { status: 400 },
    );
  }

  const investorEmail =
    typeof parsed?.investorEmail === "string" && parsed.investorEmail.trim()
      ? parsed.investorEmail.trim()
      : null;
  if (!investorEmail || !investorEmail.includes("@")) {
    return NextResponse.json(
      { ok: false, error: "investorEmail is required and must be a valid email" },
      { status: 400 },
    );
  }

  let expiresAt: Date | null = null;
  if (typeof parsed?.expiresAt === "string" && parsed.expiresAt.trim()) {
    const d = new Date(parsed.expiresAt.trim());
    if (isNaN(d.getTime())) {
      return NextResponse.json(
        { ok: false, error: "expiresAt must be a valid ISO date string" },
        { status: 400 },
      );
    }
    expiresAt = d;
  }

  const result = await createInvestorLink({
    scoreId,
    founderUserId: user.id,
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
    createdByEmail: user.email,
    expiresAt,
  });

  if (!result.ok) {
    if (result.reason === "score_not_found") {
      return NextResponse.json(
        { ok: false, error: "Score not found or you do not own it." },
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

  const { link } = result;
  const url = link.slug
    ? `${siteUrl()}/s/${link.slug}`
    : `${siteUrl()}/s/i/${link.token}`;

  return NextResponse.json({
    ok: true,
    token: link.token,
    slug: link.slug,
    url,
    investorEmail: link.investorEmail,
    investorName: link.investorName,
    fundName: link.fundName,
    createdAt: link.createdAt,
  });
}

// ---------------------------------------------------------------------------
// GET — list all investor links for the authenticated founder
// ---------------------------------------------------------------------------
export async function GET() {
  if (!isSupabaseConfigured()) return notConfigured();

  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const links = await listInvestorLinksForFounder(user.id, user.email);

  return NextResponse.json({ ok: true, links });
}

// ---------------------------------------------------------------------------
// DELETE — revoke a link by token (query param: ?id=<token>)
// ---------------------------------------------------------------------------
export async function DELETE(request: Request) {
  if (!isSupabaseConfigured()) return notConfigured();

  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(request.url);
  const token = searchParams.get("id")?.trim() ?? "";
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "?id=<token> is required" },
      { status: 400 },
    );
  }

  const result = await revokeInvestorLink(token, user.id, user.email);

  if (!result.ok) {
    if (result.reason === "not_found") {
      return NextResponse.json(
        { ok: false, error: "Link not found or you do not own it." },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "Could not revoke link." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}

export const dynamic = "force-dynamic";
