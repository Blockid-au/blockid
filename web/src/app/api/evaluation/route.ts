// GET  /api/evaluation — List all 13 criteria for the authenticated user
// POST /api/evaluation — Create or update a criterion's evidence
//
// Data is scoped to (account_id, criterion_key) via svi_accounts.
// When no criteria rows exist yet, the GET returns all 13 keys with empty data
// so the UI can render the full grid immediately.

import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  CRITERION_KEYS,
  CRITERIA,
  getCriterion,
  computeQuality,
  computeEvaluationProgress,
  type CriterionKey,
} from "@/lib/evaluation-criteria";
import {
  getProjectIdFromRequest,
  findSVIAccountWithFallback,
  findOrCreateSVIAccount,
} from "@/lib/projects";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET — list all 13 criteria for the current user's active project
// ---------------------------------------------------------------------------

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 503 });
  }

  const projectId = await getProjectIdFromRequest();
  const account = await findSVIAccountWithFallback(user.email, projectId);

  // If the user has no SVI account yet, return all 13 criteria as empty
  if (!account) {
    const emptyCriteria = CRITERIA.map((def) => ({
      criterion_key: def.key,
      title: def.title,
      subtitle: def.subtitle,
      icon: def.icon,
      weight: def.weight,
      primary_dimension: def.primaryDimension,
      min_evidence: def.minEvidence,
      guiding_questions: def.guidingQuestions,
      suggested_file_types: def.suggestedFileTypes,
      suggested_links: def.suggestedLinks,
      // Empty data
      text_input: "",
      files: [],
      links: [],
      ai_score: null,
      ai_summary: null,
      ai_suggestions: [],
      quality_level: "incomplete",
      created_at: null,
      updated_at: null,
    }));

    return NextResponse.json({
      ok: true,
      criteria: emptyCriteria,
      progress: 0,
    });
  }

  const accountId = account.id as string;

  // Load existing criteria rows
  const { data: rows, error } = await supabase
    .from("evaluation_criteria")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[blockid:evaluation] GET query failed", error);
    return NextResponse.json({ ok: false, error: "Failed to load criteria" }, { status: 500 });
  }

  const existingMap = new Map<string, Record<string, unknown>>();
  for (const row of rows ?? []) {
    existingMap.set(row.criterion_key as string, row);
  }

  // Merge definitions with stored data — always return all 13 keys
  const criteria = CRITERIA.map((def) => {
    const row = existingMap.get(def.key);
    return {
      criterion_key: def.key,
      title: def.title,
      subtitle: def.subtitle,
      icon: def.icon,
      weight: def.weight,
      primary_dimension: def.primaryDimension,
      min_evidence: def.minEvidence,
      guiding_questions: def.guidingQuestions,
      suggested_file_types: def.suggestedFileTypes,
      suggested_links: def.suggestedLinks,
      // Stored data (or empty defaults)
      text_input: (row?.text_input as string) ?? "",
      files: (row?.files as unknown[]) ?? [],
      links: (row?.links as unknown[]) ?? [],
      ai_score: (row?.ai_score as number) ?? null,
      ai_summary: (row?.ai_summary as string) ?? null,
      ai_suggestions: (row?.ai_suggestions as unknown[]) ?? [],
      quality_level: (row?.quality_level as string) ?? "incomplete",
      created_at: (row?.created_at as string) ?? null,
      updated_at: (row?.updated_at as string) ?? null,
    };
  });

  const progress = computeEvaluationProgress(
    criteria.map((c) => ({
      criterion_key: c.criterion_key,
      quality_level: c.quality_level,
    })),
  );

  return NextResponse.json({ ok: true, criteria, progress });
}

// ---------------------------------------------------------------------------
// POST — create or update a single criterion's evidence
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 503 });
  }

  // Parse body
  let body: {
    criterionKey?: string;
    textInput?: string;
    files?: Array<{ name: string; url: string; type: string; size: number; uploaded_at: string }>;
    links?: Array<{ url: string; label: string; verified_at: string | null }>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate criterion key
  const criterionKey = body.criterionKey as string;
  if (!criterionKey || !CRITERION_KEYS.includes(criterionKey as CriterionKey)) {
    return NextResponse.json({
      ok: false,
      error: `Invalid criterionKey. Must be one of: ${CRITERION_KEYS.join(", ")}`,
    }, { status: 400 });
  }

  const def = getCriterion(criterionKey as CriterionKey);
  if (!def) {
    return NextResponse.json({ ok: false, error: "Criterion definition not found" }, { status: 400 });
  }

  // Validate files structure if provided
  const files = body.files ?? [];
  if (!Array.isArray(files)) {
    return NextResponse.json({ ok: false, error: "files must be an array" }, { status: 400 });
  }
  for (const f of files) {
    if (!f.name || !f.url || typeof f.size !== "number") {
      return NextResponse.json({
        ok: false,
        error: "Each file must have name, url, type, size, uploaded_at",
      }, { status: 400 });
    }
  }

  // Validate links structure if provided
  const links = body.links ?? [];
  if (!Array.isArray(links)) {
    return NextResponse.json({ ok: false, error: "links must be an array" }, { status: 400 });
  }
  for (const l of links) {
    if (!l.url) {
      return NextResponse.json({
        ok: false,
        error: "Each link must have at least a url",
      }, { status: 400 });
    }
  }

  const textInput = typeof body.textInput === "string" ? body.textInput : "";

  // Find or create the SVI account for the current project
  const projectId = await getProjectIdFromRequest();
  const accountId = await findOrCreateSVIAccount(user.email, projectId);
  if (!accountId) {
    return NextResponse.json({ ok: false, error: "Could not resolve account" }, { status: 500 });
  }

  // Compute quality level
  const qualityLevel = computeQuality({
    text_input: textInput,
    files,
    links,
  });

  const now = new Date().toISOString();

  // Upsert the criterion row
  const { data: upserted, error: upsertErr } = await supabase
    .from("evaluation_criteria")
    .upsert(
      {
        account_id: accountId,
        project_id: projectId,
        criterion_key: criterionKey,
        text_input: textInput,
        files,
        links,
        quality_level: qualityLevel,
        primary_dimension: def.primaryDimension,
        secondary_dimension: def.secondaryDimensions[0] ?? null,
        updated_at: now,
      },
      { onConflict: "account_id,criterion_key" },
    )
    .select("*")
    .single();

  if (upsertErr) {
    console.error("[blockid:evaluation] upsert failed", upsertErr);
    return NextResponse.json({ ok: false, error: "Failed to save criterion" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    criterion: {
      criterion_key: upserted.criterion_key,
      text_input: upserted.text_input,
      files: upserted.files,
      links: upserted.links,
      ai_score: upserted.ai_score,
      ai_summary: upserted.ai_summary,
      ai_suggestions: upserted.ai_suggestions,
      quality_level: upserted.quality_level,
      updated_at: upserted.updated_at,
    },
    qualityLevel,
  });
}
