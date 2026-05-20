import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/ai-keys — list all saved provider keys
 * POST /api/admin/ai-keys — save/update a provider key
 * DELETE /api/admin/ai-keys — remove a provider key
 */

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || (user.email !== "admin@blockid.au" && user.role !== "admin")) {
    return null;
  }
  return user;
}

export async function GET() {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { data, error } = await supabase
    .from("ai_provider_keys")
    .select("provider, api_key, base_url, is_active, updated_at, updated_by")
    .order("provider");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Mask keys for display (show first 12 + last 4 chars)
  const masked = (data ?? []).map((row) => ({
    ...row,
    api_key_masked: row.api_key
      ? `${row.api_key.slice(0, 12)}...${row.api_key.slice(-4)}`
      : "",
    api_key_full: row.api_key, // Admin can see full key
  }));

  return NextResponse.json({ ok: true, keys: masked });
}

export async function POST(request: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const body = await request.json() as {
    provider: string;
    api_key: string;
    base_url?: string;
    is_active?: boolean;
  };

  if (!body.provider || !body.api_key) {
    return NextResponse.json({ error: "provider and api_key are required" }, { status: 400 });
  }

  const validProviders = ["anthropic", "anthropic_proxy", "openai", "gemini"];
  if (!validProviders.includes(body.provider)) {
    return NextResponse.json({ error: `Invalid provider. Must be one of: ${validProviders.join(", ")}` }, { status: 400 });
  }

  const { error } = await supabase.from("ai_provider_keys").upsert({
    provider: body.provider,
    api_key: body.api_key.trim(),
    base_url: body.base_url?.trim() || null,
    is_active: body.is_active ?? true,
    updated_at: new Date().toISOString(),
    updated_by: user.email,
  }, { onConflict: "provider" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, provider: body.provider });
}

export async function DELETE(request: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const body = await request.json() as { provider: string };
  if (!body.provider) {
    return NextResponse.json({ error: "provider is required" }, { status: 400 });
  }

  const { error } = await supabase.from("ai_provider_keys").delete().eq("provider", body.provider);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
