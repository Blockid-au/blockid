// GET /api/kb/search?q=... — search KB across title, content, category
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ results: [] });

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ results: [] });

  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 200);
  const supabase = getSupabaseAdmin()!;

  // Escape commas in the user query for the .or() filter to avoid breaking the
  // PostgREST grammar; Supabase JS does not auto-escape inside .or().
  const safe = q.replace(/[%,()]/g, " ");
  const { data, error } = await supabase
    .from("kb_articles")
    .select("id, slug, title, category, content, author, updated_at")
    .or(`title.ilike.%${safe}%,content.ilike.%${safe}%,category.ilike.%${safe}%`)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Add a short excerpt for each result (first 200 chars around first match)
  const results = (data ?? []).map((row) => {
    const lower = row.content.toLowerCase();
    const idx = lower.indexOf(q.toLowerCase());
    let excerpt = row.content.slice(0, 200);
    if (idx >= 0) {
      const start = Math.max(0, idx - 60);
      excerpt = (start > 0 ? "…" : "") + row.content.slice(start, start + 240);
    }
    return { ...row, excerpt };
  });

  return NextResponse.json({ results });
}
