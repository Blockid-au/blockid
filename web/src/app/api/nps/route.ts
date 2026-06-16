import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { score, comment, context } = await req.json() as { score: number; comment?: string; context?: string };
    const user = await getCurrentUser();
    const supabase = getSupabaseAdmin();
    if (supabase) {
      await supabase.from("nps_responses").insert({
        user_email: user?.email ?? "anonymous",
        score,
        comment: comment ?? "",
        context: context ?? "",
      });
    } else {
      console.log("[NPS]", { score, comment, user: user?.email });
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
  if (!supabase) return NextResponse.json({ responses: [] });
  const { data } = await supabase
    .from("nps_responses")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  return NextResponse.json({ responses: data ?? [] });
}
