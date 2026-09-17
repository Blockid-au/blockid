// /api/founder-profile — GET (load) + POST (save) for the current user's profile.

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { EMPTY_PROFILE, loadFounderProfile, saveFounderProfile, type FounderProfile } from "@/lib/founder-profile";
import { apiRoute } from "@/lib/audit/api-route";
import { executionFieldsFromInput, founderExecutionInputSchema } from "@/lib/founder/execution-input";
import { resolveExecutionProvenance } from "@/lib/founder/execution-provenance";
import { verifyLinkedInAttestation } from "@/lib/founder/linkedin-attestation";

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

async function POST_handler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });

  let body: Partial<FounderProfile> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  // Coerce to our shape — discard anything we don't recognise
  // G14-S37: the structured execution fields are Zod-validated (a bad exit
  // type / a non-GitHub URL is a 400 with the issues), everything else keeps
  // the legacy coercion below.
  const exec = founderExecutionInputSchema.safeParse(body);
  if (!exec.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_execution_fields", issues: exec.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      { status: 400 },
    );
  }
  const executionFields = executionFieldsFromInput(exec.data);

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
    contactable_by_investors: body.contactable_by_investors === true,
    // G14-S37 (0408)
    ...executionFields,
    execution_score: null,
    execution_computed_at: null,
  };

  // G14-review (S37 P1): `execution_source` is the cap-lifting claim
  // (lib/founder/execution.ts treats `linkedin_parser` as parser
  // confirmation). The client may only assert "founder" about itself; a
  // `linkedin_parser` stamp is honoured when the saved value matches the
  // import attestation minted by /import-linkedin, and any non-founder stamp
  // survives a re-save only while the field is unchanged. Everything else
  // is downgraded to "founder" (the save still lands).
  const existing = await Promise.resolve()
    .then(() => loadFounderProfile(user.id))
    .then((p) => p ?? null, () => null);
  const attestation = verifyLinkedInAttestation(user.id, (body as { linkedin_attestation?: unknown }).linkedin_attestation);
  const provenance = resolveExecutionProvenance({
    requested: executionFields.execution_source,
    next: safe,
    existing,
    attested: attestation.ok ? attestation.claims : null,
  });
  safe.execution_source = provenance.execution_source;

  const result = await saveFounderProfile(safe);
  return NextResponse.json(
    { ...result, ...(provenance.downgraded.length ? { provenance_downgraded: provenance.downgraded } : {}) },
    { status: result.ok ? 200 : 500 },
  );
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/founder-profile/route.ts", method: "POST" }, POST_handler);
