// /api/founder-profile — GET (load) + POST (save) for the current user's profile.

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { EMPTY_PROFILE, loadFounderProfile, saveFounderProfile, type FounderProfile } from "@/lib/founder-profile";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const existing = await loadFounderProfile(user.id);
  return NextResponse.json({
    ok: true,
    profile: existing ?? EMPTY_PROFILE(user.id, user.email),
  });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });

  let body: Partial<FounderProfile> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  // Coerce to our shape — discard anything we don't recognise
  const safe: FounderProfile = {
    account_id: user.id,
    email: user.email,
    full_name: body.full_name?.toString().slice(0, 200) ?? null,
    role: body.role?.toString().slice(0, 100) ?? null,
    linkedin_url: body.linkedin_url?.toString().slice(0, 300) ?? null,
    bio: body.bio?.toString().slice(0, 4000) ?? null,
    prev_employers: Array.isArray(body.prev_employers) ? body.prev_employers.map(String).slice(0, 20) : [],
    ship_history: Array.isArray(body.ship_history) ? body.ship_history.map(String).slice(0, 20) : [],
    years_in_domain: typeof body.years_in_domain === "number" ? Math.max(0, Math.min(60, Math.round(body.years_in_domain))) : null,
    domain_insight: body.domain_insight?.toString().slice(0, 2000) ?? null,
    ambition: body.ambition?.toString().slice(0, 2000) ?? null,
    co_founders: Array.isArray(body.co_founders) ? body.co_founders.slice(0, 10) : [],
    advisors: Array.isArray(body.advisors) ? body.advisors.slice(0, 20) : [],
    notable_hires: Array.isArray(body.notable_hires) ? body.notable_hires.slice(0, 20) : [],
    public_visible: body.public_visible !== false,
  };

  const result = await saveFounderProfile(safe);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
