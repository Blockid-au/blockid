// POST /api/startup-package/deliverable/[slug]
//
// Founder-triggered auto-fill for a single Startup Package deliverable:
//   1. Auth-gate + rate-limit (20/hour/user).
//   2. Look up the deliverable in the registry.
//   3. Pre-flight the credit cost (`canAfford`) → 402 if short.
//   4. Build the PDF input from stored answers + latest SVI snapshot.
//   5. Render the matching PDF generator to a Buffer.
//   6. Upload the Buffer to Supabase storage bucket `dataroom` at
//      `startup-<projectId>/package/<templateSlug>-v1.pdf`.
//   7. INSERT a `dataroom_files` row with mime + template_slug + storage_path.
//   8. `spendCredits` (after upload — never charge on failure).
//   9. Return `{ ok, dataroomFileId, downloadUrl }`.
//
// SUBGOAL 7 (spawn-agent-v-d-ng-cosmic-aho plan).

import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";

import { getCurrentUser } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit/persistent";
import { canAfford, spendCredits, FEATURE_COSTS } from "@/lib/credits";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getProjectById } from "@/lib/projects";
import {
  getDeliverable,
  type DeliverableEntry,
  type DeliverableInputContext,
} from "@/lib/startup-package/deliverable-registry";

export const dynamic = "force-dynamic";

const BUCKET = "dataroom";
const RATE_LIMIT_PER_HOUR = 20;

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export async function POST(request: Request, ctx: RouteContext) {
  const { slug } = await ctx.params;

  // 1. Auth
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // 2. Rate-limit — 20/hour keyed off (user, endpoint)
  const rl = await consumeRateLimit({
    bucket: "startup_package.deliverable",
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

  // 3. Body + registry lookup
  type DeliverableBody = {
    projectId?: string;
    phaseId?: string;
    deliverableKey?: string;
  };
  let body: DeliverableBody | null = null;
  try {
    body = (await request.json()) as DeliverableBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const projectId = String(body?.projectId ?? "").trim();
  const deliverableKey = String(body?.deliverableKey ?? slug ?? "").trim();
  if (!projectId || !deliverableKey) {
    return NextResponse.json(
      { ok: false, error: "projectId and deliverableKey are required" },
      { status: 400 },
    );
  }

  const entry = getDeliverable(deliverableKey);
  if (!entry || entry.key !== slug) {
    return NextResponse.json(
      { ok: false, error: "unknown_deliverable" },
      { status: 404 },
    );
  }

  // Verify project ownership — the caller must own the project.
  const project = await getProjectById(projectId);
  if (!project || project.userId !== user.id) {
    return NextResponse.json(
      { ok: false, error: "project_not_found_or_forbidden" },
      { status: 403 },
    );
  }

  // 4. Credit pre-flight
  const affordCheck = await canAfford(user.id, entry.featureKey);
  if (!affordCheck.allowed) {
    const cost = FEATURE_COSTS[entry.featureKey] ?? affordCheck.cost;
    return NextResponse.json(
      {
        ok: false,
        error: "insufficient_credits",
        creditsRequired: cost,
        balance: affordCheck.balance,
      },
      { status: 402 },
    );
  }

  // 5. Build the input context + render the PDF
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "service_unavailable" },
      { status: 503 },
    );
  }

  const inputCtx = await buildInputContext(supabase, {
    user,
    project,
  });

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderPdfForEntry(entry, inputCtx);
  } catch (err) {
    console.error("[startup-package:deliverable] render failed", { slug, err });
    return NextResponse.json(
      { ok: false, error: "pdf_render_failed" },
      { status: 500 },
    );
  }

  // 6. Upload to Supabase storage
  const storagePath = `startup-${projectId}/package/${entry.templateSlug}-v1.pdf`;
  const uploadRes = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, pdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadRes.error) {
    console.error("[startup-package:deliverable] upload failed", {
      storagePath,
      err: uploadRes.error,
    });
    return NextResponse.json(
      { ok: false, error: "storage_upload_failed" },
      { status: 502 },
    );
  }

  // 7. Insert / upsert dataroom_files row
  const { data: existingRow } = await supabase
    .from("dataroom_files")
    .select("id")
    .eq("user_id", user.id)
    .eq("template_slug", entry.templateSlug)
    .maybeSingle();

  let dataroomFileId: string | null = null;
  if (existingRow?.id) {
    // Idempotent path — bump storage_path timestamp; skip insert to keep
    // the natural-key (user_id, template_slug) unique.
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
      console.error("[startup-package:deliverable] update dataroom_files failed", error);
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
        svi_dimension: entry.dataroomFolder,
        file_name: `${entry.templateSlug}.pdf`,
        status: "present",
        mime_type: "application/pdf",
        storage_path: storagePath,
        template_slug: entry.templateSlug,
        template_version: "v1",
      })
      .select("id")
      .maybeSingle();
    if (error) {
      console.error("[startup-package:deliverable] insert dataroom_files failed", error);
      return NextResponse.json(
        { ok: false, error: "dataroom_row_insert_failed" },
        { status: 500 },
      );
    }
    dataroomFileId = data?.id ?? null;
  }

  // 8. Spend credits (after upload — never charge on failure)
  const spend = await spendCredits(user.id, entry.featureKey, {
    project_id: projectId,
    deliverable: entry.key,
    template_slug: entry.templateSlug,
    dataroom_file_id: dataroomFileId,
  });
  if (!spend.ok) {
    // Rare race: someone spent between canAfford and here. The dataroom
    // row + PDF are already persisted so surface this as a "half-success"
    // rather than a hard failure — the founder will retry.
    return NextResponse.json(
      {
        ok: false,
        error: "credit_spend_failed",
        creditsRequired: FEATURE_COSTS[entry.featureKey] ?? 0,
        balance: spend.balance,
        dataroomFileId,
      },
      { status: 402 },
    );
  }

  // 9. Signed download URL (1h) — falls back to storage_path if signing
  // fails so the caller can still open the file via the dataroom UI.
  let downloadUrl: string | null = null;
  try {
    const signed = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 3600);
    downloadUrl = signed.data?.signedUrl ?? null;
  } catch {
    downloadUrl = null;
  }

  return NextResponse.json({
    ok: true,
    dataroomFileId,
    storagePath,
    downloadUrl,
    creditsCharged: FEATURE_COSTS[entry.featureKey] ?? 0,
    balance: spend.balance,
  });
}

// ─────────────────────────────────────────────────────────────────────────

type AuthUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
type Supabase = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

async function buildInputContext(
  supabase: Supabase,
  args: {
    user: AuthUser;
    project: NonNullable<Awaited<ReturnType<typeof getProjectById>>>;
  },
): Promise<DeliverableInputContext> {
  const [interviewRes, sviSnap] = await Promise.all([
    supabase
      .from("startup_package_interview")
      .select("step_key, answer_text, char_count")
      .eq("project_id", args.project.id)
      .order("created_at", { ascending: true })
      .then((r) => r.data ?? [])
      .catch(() => [] as Array<{ step_key: string; answer_text: string; char_count: number | null }>),
    loadLatestSvi(supabase, args.user, args.project.id),
  ]);

  const originHint = process.env.NEXT_PUBLIC_SITE_URL ?? "https://blockid.au";
  const shareUrl = args.project.slug
    ? `${originHint}/startup/${args.project.slug}`
    : `${originHint}/startup-package/${args.project.id}`;

  return {
    project: {
      id: args.project.id,
      name: args.project.name,
      slug: args.project.slug,
      description: args.project.description,
      industry: args.project.industry,
    },
    interviewAnswers: interviewRes as DeliverableInputContext["interviewAnswers"],
    sviAnalysis: sviSnap,
    founderEmail: args.user.email ?? undefined,
    founderName: args.user.displayName ?? args.user.email ?? undefined,
    shareUrl,
  };
}

async function loadLatestSvi(
  supabase: Supabase,
  user: AuthUser,
  _projectId: string,
): Promise<DeliverableInputContext["sviAnalysis"]> {
  try {
    if (!user.email) return null;
    const { data: account } = await supabase
      .from("svi_accounts")
      .select("id")
      .eq("email", user.email)
      .maybeSingle();
    if (!account) return null;

    const { data: snap } = await supabase
      .from("svi_snapshots")
      .select("svi_total, stage, analysis_json, dimension_scores, index_value")
      .eq("account_id", account.id)
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!snap) return null;

    const analysis = (snap.analysis_json as Record<string, unknown> | null) ?? null;
    return {
      totalSVI: Number(snap.index_value ?? snap.svi_total ?? 0),
      grade: typeof analysis?.grade === "string" ? (analysis.grade as string) : "—",
      stage: Number(snap.stage ?? 0),
      stageLabel:
        typeof analysis?.stageLabel === "string" ? (analysis.stageLabel as string) : "",
      dimensionScores: (snap.dimension_scores as Record<string, number> | null) ?? undefined,
      summary: typeof analysis?.summary === "string" ? (analysis.summary as string) : undefined,
      signals: (analysis?.signals as Record<string, unknown> | undefined) ?? undefined,
    };
  } catch {
    return null;
  }
}

async function renderPdfForEntry(
  entry: DeliverableEntry,
  ctx: DeliverableInputContext,
): Promise<Buffer> {
  const props = entry.inputBuilder(ctx) as Record<string, unknown>;

  switch (entry.pdfGenerator) {
    case "pitch-deck": {
      const { PitchDeckPDF } = await import("@/lib/pdf/pitch-deck-pdf");
      // PitchDeckPDF returns a JSX Document element — direct call is fine
      // for @react-pdf/renderer's Node renderer (same pattern used in
      // web/src/lib/pdf/svi-report-pdf.test.ts).
      return (await renderToBuffer(PitchDeckPDF() as never)) as Buffer;
    }
    case "investor-pack": {
      const { renderInvestorPack } = await import("@/lib/pdf/investor-pack");
      // `renderInvestorPack` takes a strongly-typed `InvestorPackData` —
      // the registry inputBuilder already produces that shape.
      return renderInvestorPack(props as never);
    }
    case "founder-pack": {
      const { renderFounderPackPdf } = await import("@/lib/pdf/founder-pack-pdf");
      return renderFounderPackPdf(props as never);
    }
    case "valuation-report": {
      const { ValuationReportPDF } = await import("@/lib/pdf/valuation-report-pdf");
      return (await renderToBuffer(
        ValuationReportPDF(props as never) as never,
      )) as Buffer;
    }
    case "svi-report": {
      const { SVIReportPDF } = await import("@/lib/pdf/svi-report-pdf");
      return (await renderToBuffer(
        SVIReportPDF(props as never) as never,
      )) as Buffer;
    }
    default: {
      throw new Error(`Unknown pdfGenerator: ${String(entry.pdfGenerator)}`);
    }
  }
}
