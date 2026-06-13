// GET  /api/kb/articles — list articles (optional ?category=&limit=&q=)
// POST /api/kb/articles — create article (admin only; service role bypasses RLS)
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const VALID_CATEGORIES = new Set([
  "valuation", "svi", "equity", "market",
  "financial", "legal", "strategy", "benchmark",
]);

export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ articles: [] });

  const url = new URL(req.url);
  const category = url.searchParams.get("category");
  const q = url.searchParams.get("q")?.trim();
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100", 10), 500);

  const supabase = getSupabaseAdmin()!;
  let query = supabase
    .from("kb_articles")
    .select("id, slug, title, category, content, metadata, author, version, is_public, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (category && VALID_CATEGORIES.has(category)) {
    query = query.eq("category", category);
  }
  if (q) {
    query = query.or(`title.ilike.%${q}%,content.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ articles: data ?? [] });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const body = await req.json().catch(() => null) as {
    slug?: string;
    title?: string;
    category?: string;
    content?: string;
    metadata?: Record<string, unknown>;
    author?: string;
    is_public?: boolean;
  } | null;

  if (!body?.slug || !body.title || !body.category || !body.content) {
    return NextResponse.json({ error: "slug, title, category, content required" }, { status: 400 });
  }
  if (!VALID_CATEGORIES.has(body.category)) {
    return NextResponse.json({ error: "invalid category" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin()!;
  const { data, error } = await supabase
    .from("kb_articles")
    .insert({
      slug: body.slug,
      title: body.title,
      category: body.category,
      content: body.content,
      metadata: body.metadata ?? {},
      author: body.author ?? "system",
      is_public: body.is_public ?? false,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ article: data });
}
