// POST /api/founder/pitch-video
//
// Generates a 60-second "Pitch Snapshot" MP4 for a founder's startup by
// rendering the PitchSnapshot Remotion composition server-side.
//
// Flow:
//   1. Auth-gate (getCurrentUser).
//   2. Rate-limit: 3 renders/hour per user.
//   3. Verify startup_id ownership via projects table.
//   4. Credit pre-flight: pitch_video = 2 credits.
//   5. Build PitchSnapshotProps from project row + latest SVI snapshot.
//   6. Render locally via @remotion/renderer (renderMedia).
//   7. Upload MP4 to Supabase storage bucket "dataroom".
//   8. Spend credits (after upload — never charge on failure).
//   9. Return { ok, url, storagePath }.
//
// Environment variables:
//   REMOTION_SERVE_URL  — optional pre-bundled serve URL (e.g. Remotion Lambda).
//                         When absent, performs a local bundle + render.
//   NEXT_PUBLIC_SITE_URL — used to construct the CTA slug URL.

import "server-only";

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";

import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getProjectById } from "@/lib/projects";
import { consumeRateLimit } from "@/lib/rate-limit/persistent";
import { canAfford, spendCredits, FEATURE_COSTS } from "@/lib/credits";
import type { PitchSnapshotProps } from "@/remotion/pitch-snapshot/PitchSnapshot";

export const dynamic = "force-dynamic";
// Remotion renders can take up to 5 minutes; override Next.js default timeout.
export const maxDuration = 300;

const FEATURE_KEY = "pitch_video";
const BUCKET = "dataroom";
const RATE_LIMIT = 3;
const RATE_WINDOW = 3600; // 1 hour

// Root TSX entry point — relative to the web/ project root.
const REMOTION_ROOT = path.join(process.cwd(), "src", "remotion", "pitch-snapshot", "Root.tsx");
const COMPOSITION_ID = "PitchSnapshot";

interface RequestBody {
  startup_id: string;
}

export async function POST(req: NextRequest) {
  // ── 1. Auth ────────────────────────────────────────────────────────────────
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // ── 2. Rate limit ──────────────────────────────────────────────────────────
  const rl = await consumeRateLimit({
    bucket: "founder.pitch_video",
    actorId: user.id,
    limit: RATE_LIMIT,
    windowSeconds: RATE_WINDOW,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: "rate_limited",
        message: `You can generate up to ${RATE_LIMIT} pitch videos per hour.`,
        retry_after_seconds: rl.retry_after_seconds ?? 60,
      },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retry_after_seconds ?? 60) },
      },
    );
  }

  // ── 3. Parse body + verify project ownership ───────────────────────────────
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const startupId = String(body?.startup_id ?? "").trim();
  if (!startupId) {
    return NextResponse.json(
      { ok: false, error: "startup_id is required" },
      { status: 400 },
    );
  }

  const project = await getProjectById(startupId);
  if (!project || project.userId !== user.id) {
    return NextResponse.json(
      { ok: false, error: "project_not_found_or_forbidden" },
      { status: 403 },
    );
  }

  // ── 4. Credit pre-flight ───────────────────────────────────────────────────
  const afford = await canAfford(user.id, FEATURE_KEY);
  if (!afford.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: "insufficient_credits",
        creditsRequired: FEATURE_COSTS[FEATURE_KEY] ?? 2,
        balance: afford.balance,
      },
      { status: 402 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  // ── 5. Build composition props ─────────────────────────────────────────────
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://blockid.au";
  const props = await buildPitchSnapshotProps(supabase, user, project, siteUrl);

  // ── 6. Render MP4 ──────────────────────────────────────────────────────────
  let mp4Buffer: Buffer;
  try {
    mp4Buffer = await renderPitchVideo(props);
  } catch (err) {
    console.error("[pitch-video] render failed", { startupId, err });
    return NextResponse.json(
      { ok: false, error: "render_failed", detail: String(err) },
      { status: 500 },
    );
  }

  // ── 7. Upload to Supabase storage ──────────────────────────────────────────
  const storagePath = `startup-${startupId}/pitch-snapshot/pitch-snapshot-v1.mp4`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, mp4Buffer, {
      contentType: "video/mp4",
      upsert: true,
    });

  if (uploadError) {
    console.error("[pitch-video] upload failed", { storagePath, err: uploadError });
    return NextResponse.json(
      { ok: false, error: "storage_upload_failed" },
      { status: 502 },
    );
  }

  // ── 8. Spend credits (after upload — never charge on failure) ─────────────
  const spend = await spendCredits(user.id, FEATURE_KEY, {
    project_id: startupId,
    storage_path: storagePath,
    composition: COMPOSITION_ID,
  });

  if (!spend.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "credit_spend_failed",
        creditsRequired: FEATURE_COSTS[FEATURE_KEY] ?? 2,
        balance: spend.balance,
        storagePath,
      },
      { status: 402 },
    );
  }

  // ── 9. Signed URL (1 hour) + return ───────────────────────────────────────
  let url: string | null = null;
  try {
    const signed = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 3600);
    url = signed.data?.signedUrl ?? null;
  } catch {
    url = null;
  }

  return NextResponse.json({
    ok: true,
    url,
    storagePath,
    creditsCharged: FEATURE_COSTS[FEATURE_KEY] ?? 2,
    balance: spend.balance,
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────

type AuthUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
type Supabase = NonNullable<ReturnType<typeof getSupabaseAdmin>>;
type Project = NonNullable<Awaited<ReturnType<typeof getProjectById>>>;

async function buildPitchSnapshotProps(
  supabase: Supabase,
  user: AuthUser,
  project: Project,
  siteUrl: string,
): Promise<PitchSnapshotProps> {
  // Load latest SVI snapshot for this user (scoped to user's email like the
  // existing `loadLatestSvi` pattern in the startup-package deliverable route).
  type SviRow = {
    svi_total: number | null;
    index_value: number | null;
    stage: number | null;
    analysis_json: Record<string, unknown> | null;
  };
  let sviRow: SviRow | null = null;
  try {
    if (user.email) {
      const { data: account } = await supabase
        .from("svi_accounts")
        .select("id")
        .eq("email", user.email)
        .maybeSingle();
      if (account) {
        const { data: snap } = await supabase
          .from("svi_snapshots")
          .select("svi_total, index_value, stage, analysis_json")
          .eq("account_id", account.id)
          .order("snapshot_date", { ascending: false })
          .limit(1)
          .maybeSingle();
        sviRow = snap as SviRow | null;
      }
    }
  } catch {
    // Non-fatal — continue without SVI data.
  }

  const analysis = sviRow?.analysis_json ?? null;
  const sviScore = Number(sviRow?.index_value ?? sviRow?.svi_total ?? 0) || null;
  const sviGrade =
    typeof analysis?.grade === "string" ? (analysis.grade as string) : null;

  const stageNum = sviRow?.stage ?? 0;
  const stageName = stageFromNum(stageNum);

  return {
    startupName: project.name,
    tagline: project.description ?? undefined,
    description: project.description ?? undefined,
    sector: project.industry ?? undefined,
    stage: stageName,
    slug: project.slug ?? undefined,
    sviScore,
    sviGrade,
    // Fields not stored on project row — leave as undefined (graceful fallback text shown).
    problem: undefined,
    solution: undefined,
    tam: undefined,
    sam: undefined,
    som: undefined,
    traction: undefined,
    team: undefined,
    ask: undefined,
  };
}

function stageFromNum(n: number): string {
  if (n <= 1) return "Pre-Seed";
  if (n <= 3) return "Seed";
  if (n <= 5) return "Series A";
  return "Series B+";
}

/**
 * Render the PitchSnapshot composition to an MP4 buffer.
 *
 * If REMOTION_SERVE_URL is set, skips local bundling (use for Lambda or a
 * pre-deployed serve URL). Otherwise, bundles the Root.tsx on the fly via
 * @remotion/bundler and renders via @remotion/renderer.
 *
 * The render is intentionally low-bitrate (crf=28) to keep file size under
 * ~20MB for typical 60-second renders.
 */
async function renderPitchVideo(props: PitchSnapshotProps): Promise<Buffer> {
  // Dynamic imports: Remotion renderer is a heavy server-only dependency.
  // Lazy-load to avoid polluting the browser bundle.
  const { bundle } = await import("@remotion/bundler");
  const { renderMedia, selectComposition } = await import("@remotion/renderer");

  const serveUrl =
    process.env.REMOTION_SERVE_URL ??
    (await bundle({
      entryPoint: REMOTION_ROOT,
      // Webpack config lives in next.config.ts — not available here, so we
      // use Remotion's own webpack config which handles TSX/TS fine.
    }));

  const composition = await selectComposition({
    serveUrl,
    id: COMPOSITION_ID,
    inputProps: props as unknown as Record<string, unknown>,
  });

  const outPath = path.join(
    os.tmpdir(),
    `pitch-snapshot-${Date.now()}.mp4`,
  );

  try {
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      outputLocation: outPath,
      inputProps: props as unknown as Record<string, unknown>,
      chromiumOptions: {
        disableWebSecurity: false,
      },
      // Keep file size reasonable for a 60-second video.
      crf: 28,
      // Single-thread render to avoid saturating the bare-metal server.
      concurrency: 1,
    });

    const buf = fs.readFileSync(outPath);
    return buf;
  } finally {
    // Always clean up the temp file.
    try {
      fs.unlinkSync(outPath);
    } catch {
      // Ignore cleanup errors.
    }
  }
}
