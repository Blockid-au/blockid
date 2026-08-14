// POST /api/startup-package/deliverable/accelerator-apply
//
// Founder-triggered accelerator-application drafter. Mirrors the
// `[slug]/route.ts` deliverable pipeline (auth → rate-limit → credits →
// generate → upload → dataroom row → spend) but drafts N text answers via
// `draftAcceleratorApplication()` and renders them into a single PDF.
//
// Body: `{ project_id, accelerator_slug }`.
// Response: `{ ok, dataroomFileId, downloadUrl, drafts }`.

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit/persistent";
import { canAfford, spendCredits, FEATURE_COSTS } from "@/lib/credits";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getProjectById } from "@/lib/projects";
import {
  draftAcceleratorApplication,
  getAcceleratorBySlug,
} from "@/lib/agents/accelerator-drafter";
import { renderAcceleratorApplyPdf } from "@/lib/pdf/accelerator-apply-pdf";

export const dynamic = "force-dynamic";

const BUCKET = "dataroom";
const RATE_LIMIT_PER_HOUR = 20;
const FEATURE_KEY = "accelerator_apply";

export async function POST(request: Request) {
  // 1. Auth
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // 2. Rate-limit
  const rl = await consumeRateLimit({
    bucket: "startup_package.accelerator_apply",
    actorId: user.id,
    limit: RATE_LIMIT_PER_HOUR,
    windowSeconds: 3600,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: "rate_limited",
        retry_after_seconds: rl.retry_after_seconds ?? 60,
      },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retry_after_seconds ?? 60) },
      },
    );
  }

  // 3. Body
  let body: { project_id?: string; projectId?: string; accelerator_slug?: string } | null = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const projectId = String(body?.project_id ?? body?.projectId ?? "").trim();
  const acceleratorSlug = String(body?.accelerator_slug ?? "").trim();
  if (!projectId || !acceleratorSlug) {
    return NextResponse.json(
      { ok: false, error: "project_id and accelerator_slug are required" },
      { status: 400 },
    );
  }

  const program = getAcceleratorBySlug(acceleratorSlug);
  if (!program) {
    return NextResponse.json(
      { ok: false, error: "unknown_accelerator" },
      { status: 404 },
    );
  }

  // 4. Ownership check
  const project = await getProjectById(projectId);
  if (!project || project.userId !== user.id) {
    return NextResponse.json(
      { ok: false, error: "project_not_found_or_forbidden" },
      { status: 403 },
    );
  }

  // 5. Credit pre-flight
  const afford = await canAfford(user.id, FEATURE_KEY);
  if (!afford.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: "insufficient_credits",
        creditsRequired: FEATURE_COSTS[FEATURE_KEY] ?? afford.cost,
        balance: afford.balance,
      },
      { status: 402 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "service_unavailable" },
      { status: 503 },
    );
  }

  // 6. Load interview answers + SVI snapshot
  const [answersRes, sviRes] = await Promise.all([
    supabase
      .from("startup_package_interview")
      .select("step_key, answer_text")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true })
      .then(
        (r) => r.data ?? [],
        () => [] as Array<{ step_key: string; answer_text: string }>,
      ),
    loadLatestSviForUser(supabase, user.email ?? null),
  ]);

  const interviewAnswers: Record<string, string> = {};
  for (const row of answersRes) {
    if (row?.step_key && typeof row.answer_text === "string") {
      interviewAnswers[row.step_key] = row.answer_text;
    }
  }

  // 7. Draft the application
  let drafts: Record<string, string>;
  try {
    drafts = await draftAcceleratorApplication({
      accelerator_slug: acceleratorSlug,
      startup_name: project.name,
      interview_answers: interviewAnswers,
      svi_score: sviRes?.totalSVI,
      svi_dimensions: sviRes?.dimensionScores,
    });
  } catch (err) {
    console.error("[accelerator-apply] draft failed", { acceleratorSlug, err });
    return NextResponse.json(
      { ok: false, error: "draft_failed" },
      { status: 500 },
    );
  }

  // 8. Render PDF
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderAcceleratorApplyPdf({
      startupName: project.name,
      program,
      drafts,
      email: user.email ?? undefined,
      founderName: user.displayName ?? undefined,
    });
  } catch (err) {
    console.error("[accelerator-apply] pdf render failed", { acceleratorSlug, err });
    return NextResponse.json(
      { ok: false, error: "pdf_render_failed" },
      { status: 500 },
    );
  }

  // 9. Upload to storage
  const templateSlug = `package_pitch_accelerator_apply_${acceleratorSlug}`;
  const storagePath = `startup-${projectId}/package/${templateSlug}-v1.pdf`;
  const uploadRes = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, pdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    });
  if (uploadRes.error) {
    console.error("[accelerator-apply] upload failed", uploadRes.error);
    return NextResponse.json(
      { ok: false, error: "storage_upload_failed" },
      { status: 502 },
    );
  }

  // 10. dataroom_files upsert
  const { data: existingRow } = await supabase
    .from("dataroom_files")
    .select("id")
    .eq("user_id", user.id)
    .eq("template_slug", templateSlug)
    .maybeSingle();

  let dataroomFileId: string | null = null;
  if (existingRow?.id) {
    const { data, error } = await supabase
      .from("dataroom_files")
      .update({
        storage_path: storagePath,
        mime_type: "application/pdf",
        status: "present",
        template_version: "v1",
      })
      .eq("id", existingRow.id)
      .select("id")
      .maybeSingle();
    if (error) {
      console.error("[accelerator-apply] update dataroom_files failed", error);
      return NextResponse.json(
        { ok: false, error: "dataroom_row_update_failed" },
        { status: 500 },
      );
    }
    dataroomFileId = data?.id ?? null;
  } else {
    const { data, error } = await supabase
      .from("dataroom_files")
      .insert({
        user_id: user.id,
        email: user.email ?? "",
        svi_dimension: "accelerator",
        file_name: `${templateSlug}.pdf`,
        status: "present",
        mime_type: "application/pdf",
        storage_path: storagePath,
        template_slug: templateSlug,
        template_version: "v1",
      })
      .select("id")
      .maybeSingle();
    if (error) {
      console.error("[accelerator-apply] insert dataroom_files failed", error);
      return NextResponse.json(
        { ok: false, error: "dataroom_row_insert_failed" },
        { status: 500 },
      );
    }
    dataroomFileId = data?.id ?? null;
  }

  // 11. Spend credits
  const spend = await spendCredits(user.id, FEATURE_KEY, {
    project_id: projectId,
    accelerator_slug: acceleratorSlug,
    template_slug: templateSlug,
    dataroom_file_id: dataroomFileId,
  });
  if (!spend.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "credit_spend_failed",
        creditsRequired: FEATURE_COSTS[FEATURE_KEY] ?? 0,
        balance: spend.balance,
        dataroomFileId,
      },
      { status: 402 },
    );
  }

  // 12. Signed download URL
  let downloadUrl: string | null = null;
  try {
    const signed = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 3600);
    downloadUrl = signed.data?.signedUrl ?? null;
  } catch {
    downloadUrl = null;
  }

  return NextResponse.json({
    ok: true,
    dataroomFileId,
    storagePath,
    downloadUrl,
    creditsCharged: FEATURE_COSTS[FEATURE_KEY] ?? 0,
    balance: spend.balance,
    drafts,
    program: { slug: program.slug, name: program.name, url: program.url },
  });
}

// ─────────────────────────────────────────────────────────────────────────

type Supabase = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

async function loadLatestSviForUser(
  supabase: Supabase,
  email: string | null,
): Promise<{ totalSVI?: number; dimensionScores?: Record<string, number> } | null> {
  if (!email) return null;
  try {
    const { data: account } = await supabase
      .from("svi_accounts")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (!account) return null;
    const { data: snap } = await supabase
      .from("svi_snapshots")
      .select("svi_total, index_value, dimension_scores")
      .eq("account_id", account.id)
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!snap) return null;
    return {
      totalSVI: Number(snap.index_value ?? snap.svi_total ?? 0),
      dimensionScores:
        (snap.dimension_scores as Record<string, number> | null) ?? undefined,
    };
  } catch {
    return null;
  }
}
