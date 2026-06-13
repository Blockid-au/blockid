// Knowledge Base client — shared TypeScript module that C-Level AI agents and
// internal services import to read from and write to the BlockID KB.
//
// Server-only: uses the Supabase service role key to bypass RLS. Never import
// this from a "use client" component.

import "server-only";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export type KBCategory =
  | "valuation" | "svi" | "equity" | "market"
  | "financial" | "legal" | "strategy" | "benchmark";

export type KBMethodologyType =
  | "valuation_method" | "svi_dimension" | "equity_model"
  | "financial_template" | "process";

export interface KBArticle {
  id: string;
  slug: string;
  title: string;
  category: KBCategory;
  content: string;
  metadata: Record<string, unknown>;
  author: string;
  version: number;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface KBMethodology {
  id: string;
  name: string;
  type: KBMethodologyType;
  description: string;
  inputs: Array<{ name: string; type: string; description: string; required?: boolean }>;
  formula: string | null;
  formula_code: string | null;
  examples: Array<{ input: unknown; output: unknown; notes?: string }>;
  refs: Array<{ source: string; url?: string; date?: string }>;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface KBWriteInput {
  slug: string;
  title: string;
  category: KBCategory;
  content: string;
  metadata?: Record<string, unknown>;
  author?: string;
  is_public?: boolean;
}

export interface KBResearchNote {
  agent: string;
  topic: string;
  findings: string;
  confidence?: number;
  applied_to?: string;
  source_url?: string;
}

/** Full-text-ish search across title, content, category. */
export async function kbSearch(query: string, limit = 25): Promise<KBArticle[]> {
  if (!isSupabaseConfigured() || !query.trim()) return [];
  const safe = query.replace(/[%,()]/g, " ");
  const supabase = getSupabaseAdmin()!;
  const { data, error } = await supabase
    .from("kb_articles")
    .select("*")
    .or(`title.ilike.%${safe}%,content.ilike.%${safe}%,category.ilike.%${safe}%`)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("[kb-client] search failed:", error.message);
    return [];
  }
  return (data ?? []) as KBArticle[];
}

/** Fetch a single article by slug. Returns null if not found. */
export async function kbGet(slug: string): Promise<KBArticle | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabaseAdmin()!;
  const { data, error } = await supabase
    .from("kb_articles")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) {
    console.warn("[kb-client] get failed:", error.message);
    return null;
  }
  return (data as KBArticle | null) ?? null;
}

/** List articles, optionally filtered by category. */
export async function kbList(category?: KBCategory, limit = 200): Promise<KBArticle[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabaseAdmin()!;
  let query = supabase
    .from("kb_articles")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (category) query = query.eq("category", category);
  const { data, error } = await query;
  if (error) {
    console.warn("[kb-client] list failed:", error.message);
    return [];
  }
  return (data ?? []) as KBArticle[];
}

/**
 * Upsert an article. If `slug` exists the existing row is updated and version
 * is incremented; otherwise a new row is inserted. C-Level agents call this
 * to commit new methodologies, insights, or refinements.
 */
export async function kbWrite(entry: KBWriteInput): Promise<KBArticle | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabaseAdmin()!;

  const existing = await kbGet(entry.slug);
  if (existing) {
    const { data, error } = await supabase
      .from("kb_articles")
      .update({
        title: entry.title,
        category: entry.category,
        content: entry.content,
        metadata: entry.metadata ?? existing.metadata,
        author: entry.author ?? existing.author,
        is_public: entry.is_public ?? existing.is_public,
        version: existing.version + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) {
      console.warn("[kb-client] update failed:", error.message);
      return null;
    }
    return data as KBArticle;
  }

  const { data, error } = await supabase
    .from("kb_articles")
    .insert({
      slug: entry.slug,
      title: entry.title,
      category: entry.category,
      content: entry.content,
      metadata: entry.metadata ?? {},
      author: entry.author ?? "system",
      is_public: entry.is_public ?? false,
    })
    .select()
    .single();
  if (error) {
    console.warn("[kb-client] insert failed:", error.message);
    return null;
  }
  return data as KBArticle;
}

/** Append a research note from a C-Level agent. Fire-and-forget. */
export async function kbLogResearch(note: KBResearchNote): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const supabase = getSupabaseAdmin()!;
  const { error } = await supabase.from("kb_research_notes").insert({
    agent: note.agent,
    topic: note.topic,
    findings: note.findings,
    confidence: note.confidence,
    applied_to: note.applied_to,
    source_url: note.source_url,
  });
  if (error) console.warn("[kb-client] log research failed:", error.message);
}

/** List methodologies, optionally filtered by type. */
export async function kbListMethodologies(type?: KBMethodologyType): Promise<KBMethodology[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabaseAdmin()!;
  let query = supabase.from("kb_methodologies").select("*").order("name");
  if (type) query = query.eq("type", type);
  const { data, error } = await query;
  if (error) {
    console.warn("[kb-client] list methodologies failed:", error.message);
    return [];
  }
  return (data ?? []) as KBMethodology[];
}

/** Upsert a methodology by name. */
export async function kbWriteMethodology(input: {
  name: string;
  type: KBMethodologyType;
  description: string;
  inputs?: KBMethodology["inputs"];
  formula?: string;
  formula_code?: string;
  examples?: KBMethodology["examples"];
  refs?: KBMethodology["refs"];
  created_by?: string;
}): Promise<KBMethodology | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabaseAdmin()!;
  const { data, error } = await supabase
    .from("kb_methodologies")
    .upsert(
      {
        name: input.name,
        type: input.type,
        description: input.description,
        inputs: input.inputs ?? [],
        formula: input.formula ?? null,
        formula_code: input.formula_code ?? null,
        examples: input.examples ?? [],
        refs: input.refs ?? [],
        created_by: input.created_by ?? "cfo",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "name" },
    )
    .select()
    .single();
  if (error) {
    console.warn("[kb-client] upsert methodology failed:", error.message);
    return null;
  }
  return data as KBMethodology;
}
