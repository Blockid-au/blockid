import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { getCurrentUser } from "@/lib/auth";
import { uploadAndShareWithAdmin } from "@/lib/google-drive";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getProjectIdFromRequest, findOrCreateSVIAccount } from "@/lib/projects";
import { getScannerVersion, scanBuffer } from "@/lib/security/clamav";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/**
 * POST /api/evidence/upload
 *
 * Authenticated founders upload evidence bytes (PDF/DOCX/XLSX/PNG/JPG/CSV)
 * for their active project. The bytes flow through three gates before they
 * are trusted:
 *
 *   1. Malware gate — clamd INSTREAM via web/src/lib/security/clamav.ts.
 *      Fail-CLOSED (503) so a scanner-unavailable window is NOT an upload
 *      bypass. Infected returns 422 with the signature. Both branches
 *      record an audit row in upload_scans (migration 0301) so the row
 *      cannot be attributed only to the sibling /api/upload endpoint —
 *      this is a shared audit surface.
 *
 *   2. Google Drive — bytes are placed in the admin-shared folder ONLY
 *      after the scan verdict is `clean`. A drive failure aborts before
 *      any DB row is written (see §Drive-failure below), keeping the
 *      evidence table free of orphan rows that would poison the partial
 *      UNIQUE (business_id, sha256) index and block legitimate retries.
 *
 *   3. Persistence — the row is written to BOTH the legacy `svi_evidence`
 *      table (Phase 1 vault, 78 live rows we don't want to strand) AND
 *      the new Phase 3 pipeline (`evidence` + `evidence_versions` from
 *      migrations 0210 + 0211). The extraction row (0212) is deliberately
 *      NOT seeded here — the extraction cron builds it when it processes
 *      the bytes.
 *
 * §Drive-failure: if the Drive upload throws AFTER a clean scan, we do
 * NOT insert an evidence row at all (i.e. we do NOT use verification_state
 * = 'rejected'). Reason: 0210's partial UNIQUE index (business_id, sha256)
 * WHERE verification_state <> 'archived' would count a rejected row as
 * occupying the slot, blocking the founder from a legitimate retry after
 * the transient Drive failure clears. Returning 502 with no row is the
 * least-surprising behaviour.
 *
 * §Idempotency: the partial UNIQUE index already prevents a second live
 * row for the same (business_id, sha256). We check for it BEFORE the
 * scan + Drive upload so a re-submitted file skips both round-trips and
 * returns the existing evidenceId with `deduped: true` — matches
 * Stripe's idempotent-request behaviour.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const dimension = (formData.get("dimension") as string) ?? "ptd";
    const categoryInput = (formData.get("category") as string) ?? "";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const ALLOWED_TYPES = new Set([
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // docx
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // xlsx
      "application/vnd.ms-excel", // xls
      "image/png",
      "image/jpeg",
      "image/webp",
      "text/csv",
    ]);

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { ok: false, reason: "File type not allowed. Accepted: PDF, DOCX, XLSX, PNG, JPG, CSV" },
        { status: 400 },
      );
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    // Server-generated filename token for the audit row — we mirror
    // /api/upload's rule that upload_scans.filename_stored must NEVER
    // carry attacker-controlled bytes. Evidence uploads keep the caller's
    // filename in Drive (for founder legibility), but the audit label is
    // purely derived from the sha256 so an admin surface stays safe.
    const filenameStored = `evidence-${sha256.slice(0, 16)}`;

    const supabase = getSupabaseAdmin();
    const projectId = await getProjectIdFromRequest();

    // Dedupe fast-path: skip scan + Drive if we already hold an active
    // row for these bytes in this business. Uses the partial UNIQUE index
    // scope so archived rows do NOT dedupe (a founder intentionally
    // re-uploading an archived doc should get a fresh evidence row).
    if (supabase && projectId) {
      const { data: existing } = await supabase
        .from("evidence")
        .select("id")
        .eq("business_id", projectId)
        .eq("sha256", sha256)
        .neq("verification_state", "archived")
        .maybeSingle();
      if (existing?.id) {
        return NextResponse.json({
          ok: true,
          evidenceId: existing.id as string,
          deduped: true,
        });
      }
    }

    // Malware gate — see /api/upload/route.ts for the pattern. Every
    // verdict (clean/infected/scanner_error) writes to upload_scans so
    // repeat-offender detection stays cross-endpoint.
    const scan = await scanBuffer(buffer);
    if (!scan.ok && scan.verdict === "infected") {
      await recordScan(supabase, {
        userId: user.id,
        filenameStored,
        sizeBytes: file.size,
        mimeType: file.type,
        verdict: "infected",
        signature: scan.signature ?? null,
      });
      return NextResponse.json(
        {
          error: `Upload rejected — malware signature detected: ${scan.signature ?? "unknown"}. The file was NOT stored.`,
          signature: scan.signature ?? null,
        },
        { status: 422 },
      );
    }
    if (!scan.ok && scan.verdict === "scanner_error") {
      await recordScan(supabase, {
        userId: user.id,
        filenameStored,
        sizeBytes: file.size,
        mimeType: file.type,
        verdict: "scanner_error",
        signature: null,
      });
      // Fail-CLOSED. An unscannable evidence upload MUST NOT reach
      // Google Drive — the same rule /api/upload enforces.
      return NextResponse.json(
        { error: "Virus scanner unavailable — try again shortly." },
        { status: 503 },
      );
    }

    // Upload to Google Drive AFTER scan. If Drive throws we do NOT
    // insert an evidence row (see §Drive-failure in the header).
    let driveResult;
    try {
      driveResult = await uploadAndShareWithAdmin(
        buffer,
        file.name,
        file.type,
        user.email,
      );
    } catch (driveErr) {
      // Scan was clean — record the audit row so the verdict trail is
      // complete, then bail out. No evidence row means the founder's
      // retry-after-transient-failure path stays unblocked.
      await recordScan(supabase, {
        userId: user.id,
        filenameStored,
        sizeBytes: file.size,
        mimeType: file.type,
        verdict: "clean",
        signature: null,
      });
      console.error("[blockid:evidence:upload] drive upload failed", driveErr);
      return NextResponse.json(
        { error: "Storage backend unavailable — try again shortly." },
        { status: 502 },
      );
    }

    // Scan-clean audit row lands regardless of the DB writes below —
    // upload_scans is the shared audit trail for /api/upload AND
    // /api/evidence/upload, not the persistence success signal.
    await recordScan(supabase, {
      userId: user.id,
      filenameStored,
      sizeBytes: file.size,
      mimeType: file.type,
      verdict: "clean",
      signature: null,
    });

    let evidenceId: string | null = null;
    let legacyId: string | null = null;

    if (supabase) {
      // Find or create SVI account (project-scoped) — legacy vault path.
      // We keep writing here so the 78 existing svi_evidence rows and the
      // dashboards reading from them keep functioning. Sunset happens in
      // a follow-up commit once every downstream reader is repointed.
      const accountId = await findOrCreateSVIAccount(user.email, projectId);

      if (accountId) {
        const { data: ev } = await supabase
          .from("svi_evidence")
          .insert({
            account_id: accountId,
            evidence_type: "document_uploaded",
            label: file.name,
            value_or_url: driveResult.webViewLink ?? null,
            confidence_level: "document_uploaded",
            dimension,
            svi_impact: 10,
          })
          .select("id")
          .single();
        if (ev) legacyId = ev.id as string;
      }

      // Phase 3 pipeline write — evidence (0210) + evidence_versions (0211).
      // Requires a resolved projectId because evidence.business_id FKs
      // projects.id. When projectId is null (edge cases: a founder with no
      // active project) we skip the Phase 3 write and rely on the legacy
      // row above so the upload is not lost. The extraction cron only
      // processes rows in the new table; the legacy row is a stopgap.
      if (projectId) {
        const category = normaliseCategory(categoryInput);
        const scannedAt = new Date().toISOString();
        const { data: evRow, error: evErr } = await supabase
          .from("evidence")
          .insert({
            business_id: projectId,
            owner_user_id: user.id,
            category,
            content_type: file.type,
            size_bytes: file.size,
            sha256,
            storage_path: driveResult.webViewLink ?? "",
            verification_state: "uploaded",
            scan_verdict: "clean",
            scan_scanned_at: scannedAt,
          })
          .select("id")
          .single();

        if (evErr) {
          // Race: another concurrent upload of the same bytes won the
          // partial-UNIQUE insert while we were scanning + Drive-uploading.
          // Look the winner up and return it as a dedupe rather than 500.
          if (isUniqueViolation(evErr)) {
            const { data: winner } = await supabase
              .from("evidence")
              .select("id")
              .eq("business_id", projectId)
              .eq("sha256", sha256)
              .neq("verification_state", "archived")
              .maybeSingle();
            if (winner?.id) {
              return NextResponse.json({
                ok: true,
                evidenceId: winner.id as string,
                deduped: true,
              });
            }
          }
          console.error("[blockid:evidence:upload] evidence insert failed", evErr);
        } else if (evRow) {
          evidenceId = evRow.id as string;

          // Version log — the 0211 trigger auto-fills version_number
          // when NULL, so we pass a null explicitly to lean on the trigger
          // rather than racing on MAX+1 ourselves.
          const { error: verErr } = await supabase
            .from("evidence_versions")
            .insert({
              evidence_id: evidenceId,
              version_number: null,
              sha256,
              storage_path: driveResult.webViewLink ?? "",
              size_bytes: file.size,
              content_type: file.type,
              created_by: user.id,
              change_reason: "initial upload",
            });
          if (verErr) {
            console.error("[blockid:evidence:upload] evidence_versions insert failed", verErr);
          }
        }
      }
    }

    return NextResponse.json({
      ok: true,
      fileId: driveResult.id,
      webViewLink: driveResult.webViewLink,
      evidenceId: evidenceId ?? legacyId,
      deduped: false,
    });
  } catch (err) {
    console.error("[blockid:evidence:upload] upload failed", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * Best-effort audit-row write into public.upload_scans. Mirrors the
 * private helper in /api/upload/route.ts so both endpoints feed the
 * same table (schema is verdict-agnostic — see 0301 header). Never
 * blocks or throws — audit is observability, not correctness.
 */
interface ScanAudit {
  userId: string | null;
  filenameStored: string;
  sizeBytes: number;
  mimeType: string;
  verdict: "clean" | "infected" | "scanner_error";
  signature: string | null;
}
async function recordScan(
  supabase: SupabaseClient | null,
  a: ScanAudit,
): Promise<void> {
  try {
    if (!supabase) return;
    if (!a.userId) return;
    const scannerVersion = await getScannerVersion();
    const { error } = await supabase.from("upload_scans").insert({
      user_id: a.userId,
      filename_stored: a.filenameStored,
      size_bytes: a.sizeBytes,
      mime_type: a.mimeType,
      verdict: a.verdict,
      signature: a.signature,
      scanner_version: scannerVersion === "unknown" ? null : scannerVersion,
    });
    if (error) {
      console.error("[evidence-upload:audit] insert failed", error);
    }
  } catch (err) {
    console.error("[evidence-upload:audit] unexpected error", err);
  }
}

// Canonical categories per migration 0210. The column is an open enum
// (text), but the app layer normalises so the extraction cron and Trust
// Business Report can rely on a fixed vocabulary. Anything unrecognised
// falls through to 'other' rather than exploding the request.
const CANONICAL_CATEGORIES: ReadonlySet<string> = new Set([
  "identity",
  "governance",
  "financial",
  "product",
  "traction",
  "compliance",
  "ip",
  "people",
  "esg",
  "security",
  "contract",
  "other",
]);
function normaliseCategory(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (CANONICAL_CATEGORIES.has(trimmed)) return trimmed;
  return "other";
}

// PostgREST bubbles unique_violation up as error.code === '23505'.
function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  return code === "23505";
}
