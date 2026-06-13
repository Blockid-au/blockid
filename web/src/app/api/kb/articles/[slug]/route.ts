// GET /api/kb/articles/[slug] — fetch a single KB article by slug
import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!isSupabaseConfigured()) return NextResponse.json({ article: null }, { status: 404 });

  const supabase = getSupabaseAdmin()!;
  const { data, error } = await supabase
    .from("kb_articles")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ article: null }, { status: 404 });
  return NextResponse.json({ article: data });
}
