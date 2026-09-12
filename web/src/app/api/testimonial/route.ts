import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { apiRoute } from "@/lib/audit/api-route";

export const dynamic = "force-dynamic";

async function POST_handler(req: NextRequest) {
  try {
    const { text, name, company, public: isPublic } = await req.json() as {
      text: string;
      name?: string;
      company?: string;
      public?: boolean;
    };
    const user = await getCurrentUser();
    const supabase = getSupabaseAdmin();
    if (supabase) {
      await supabase.from("testimonials").insert({
        user_email: user?.email ?? "anonymous",
        text: text ?? "",
        name: name ?? "",
        company: company ?? "",
        public: isPublic ?? false,
        approved: false,
      });
    } else {
      // Supabase not configured — silently drop (no PII to logs).
      // Testimonials are non-critical; user is not blocked.
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true }); // never block user
  }
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ testimonials: [] });
  const { data } = await supabase
    .from("testimonials")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  return NextResponse.json({ testimonials: data ?? [] });
}

async function PATCH_handler(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id, approved } = await req.json() as { id: string; approved: boolean };
    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ ok: false, error: "Service unavailable" }, { status: 503 });
    await supabase.from("testimonials").update({ approved }).eq("id", id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/testimonial/route.ts", method: "POST" }, POST_handler);
export const PATCH = apiRoute({ route: "api/testimonial/route.ts", method: "PATCH" }, PATCH_handler);
