import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
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
      console.log("[Testimonial]", { text, name, company, user: user?.email });
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

export async function PATCH(req: NextRequest) {
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
