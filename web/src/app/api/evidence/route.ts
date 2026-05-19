import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Map evidence_type → confidence_level
function mapConfidence(
  evidenceType: string,
): "self_declared" | "public_url" | "document_uploaded" | "connected_source" {
  switch (evidenceType) {
    case "text":
      return "self_declared";
    case "url":
      return "public_url";
    case "document":
      return "document_uploaded";
    case "github":
    case "analytics":
    case "stripe":
      return "connected_source";
    default:
      return "self_declared";
  }
}

// Map evidence_type → estimated svi_impact
function mapImpact(evidenceType: string): number {
  switch (evidenceType) {
    case "text":
      return 3;
    case "url":
      return 6;
    case "document":
      return 10;
    case "github":
      return 10;
    case "analytics":
      return 8;
    case "stripe":
      return 20;
    default:
      return 3;
  }
}

// Authenticate via session cookie → returns { userId, email } or null
async function authenticateRequest(supabase: ReturnType<typeof getSupabaseAdmin>) {
  if (!supabase) return null;
  const store = await cookies();
  const sessionToken = store.get("blockid_session")?.value;
  if (!sessionToken) return null;

  const { data: session } = await supabase
    .from("sessions")
    .select("user_id")
    .eq("token", sessionToken)
    .maybeSingle();
  if (!session) return null;

  const { data: user } = await supabase
    .from("app_users")
    .select("id, email")
    .eq("id", session.user_id)
    .single();
  if (!user) return null;

  return { userId: user.id as string, email: user.email as string };
}

// Find or create svi_account by email, return account id
async function findOrCreateAccount(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  email: string,
): Promise<string | null> {
  const { data: existing } = await supabase
    .from("svi_accounts")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existing) return existing.id as string;

  const { data: created, error } = await supabase
    .from("svi_accounts")
    .insert({
      email,
      last_active_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !created) {
    console.error("[blockid:evidence] svi_accounts insert failed", error);
    return null;
  }
  return created.id as string;
}

// POST /api/evidence — add an evidence item
export async function POST(request: Request) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { ok: false, error: "Service unavailable" },
        { status: 503 },
      );
    }

    const auth = await authenticateRequest(supabase);
    if (!auth) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const body = (await request.json()) as {
      evidenceType?: string;
      label?: string;
      valueOrUrl?: string;
      dimension?: string;
    };

    const { evidenceType, label, valueOrUrl, dimension } = body;

    if (!evidenceType || !label) {
      return NextResponse.json(
        { ok: false, error: "evidenceType and label are required" },
        { status: 400 },
      );
    }

    const accountId = await findOrCreateAccount(supabase, auth.email);
    if (!accountId) {
      return NextResponse.json(
        { ok: false, error: "Failed to resolve account" },
        { status: 500 },
      );
    }

    const confidenceLevel = mapConfidence(evidenceType);
    const sviImpact = mapImpact(evidenceType);

    const { data: evidence, error } = await supabase
      .from("svi_evidence")
      .insert({
        account_id: accountId,
        evidence_type: evidenceType,
        label,
        value_or_url: valueOrUrl ?? null,
        confidence_level: confidenceLevel,
        dimension: dimension ?? "general",
        svi_impact: sviImpact,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("[blockid:evidence] insert failed", error);
      return NextResponse.json(
        { ok: false, error: "Failed to save evidence" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, evidence });
  } catch (err) {
    console.error("[blockid:evidence] POST error", err);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}

// GET /api/evidence — list evidence for current user
export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { ok: false, error: "Service unavailable" },
        { status: 503 },
      );
    }

    const auth = await authenticateRequest(supabase);
    if (!auth) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const { data: account } = await supabase
      .from("svi_accounts")
      .select("id")
      .eq("email", auth.email)
      .maybeSingle();

    if (!account) {
      return NextResponse.json({ ok: true, evidence: [] });
    }

    const { data: evidence, error } = await supabase
      .from("svi_evidence")
      .select("*")
      .eq("account_id", account.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[blockid:evidence] select failed", error);
      return NextResponse.json(
        { ok: false, error: "Failed to load evidence" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, evidence: evidence ?? [] });
  } catch (err) {
    console.error("[blockid:evidence] GET error", err);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
