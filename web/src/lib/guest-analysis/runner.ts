/**
 * A$3 One-Click Guest Analysis — Phase 4 runner.
 *
 * Consumes a paid `guest_analyses` row, parses the guest's input
 * (pitch PDF/DOCX or website URL), runs the full SVI + deep-valuation
 * pipeline, generates the PDF, uploads it to the `guest-reports` bucket,
 * writes report_data + report_pdf_url back onto the row, flips
 * status='delivered', and hands off to the (Phase 5) email sender.
 *
 * Fire-and-forget: called from the Stripe webhook after the paid-status
 * flip. MUST NOT throw — every path returns {success:false,error} so the
 * webhook loop stays clean.
 *
 * Fail-soft policy: a paid guest deserves *some* report even if the
 * competitive-intelligence agent, cohort percentile, or antler signals
 * blow up. Every sub-agent is wrapped in withTimeoutSafe() and its
 * failure is logged + skipped, never propagated.
 */

import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import {
  extractSignals,
  computeSVI,
  computeFundingReadiness,
  type SVIAnalysis,
  type SVITextInput,
} from "@/lib/svi-analysis";
import { extractProjectName } from "@/lib/project-name-extractor";
import { detectInputType, scrapeUrl } from "@/lib/rnd-input";
import { buildDeepValuationAnalysis } from "@/lib/agents/deep-valuation";
import {
  detectMaturity,
  maturityValuationGuard,
} from "@/lib/agents/maturity-detector";
import { computeCohortPercentile } from "@/lib/agents/cohort-percentile";
import { evaluateAntlerSignals } from "@/lib/agents/antler-signals";
import { SVIReportPDF } from "@/lib/pdf/svi-report-pdf";
import { sendGuestReport } from "@/lib/email";

// ── Constants ──────────────────────────────────────────────────────────────

const GUEST_REPORT_BUCKET = "guest-reports";
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const SUB_AGENT_TIMEOUT_MS = 30_000;
const MAX_TEXT_CHARS = 40_000;

type RunResult = { success: true } | { success: false; error: string };

// ── Small utilities ────────────────────────────────────────────────────────

/**
 * Race `promise` against a timeout. On timeout OR on any rejection,
 * resolve with `fallback` and log the reason. Never rejects.
 */
async function withTimeoutSafe<T>(
  label: string,
  promise: Promise<T>,
  fallback: T,
  timeoutMs: number = SUB_AGENT_TIMEOUT_MS,
): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timeout after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[blockid:guest-analysis] sub-agent "${label}" failed`, msg);
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function truncateForModel(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > MAX_TEXT_CHARS
    ? trimmed.slice(0, MAX_TEXT_CHARS)
    : trimmed;
}

/** Best-effort PDF text extraction. Uses `pdf-parse` when available;
 *  falls back to a byte-scan on the buffer (better than nothing for the
 *  fail-soft path — the SVI pipeline can still score on tiny corpora). */
async function extractPdfText(filepath: string): Promise<string> {
  const buffer = await fs.readFile(filepath);
  try {
    // Dynamic import so a missing dep doesn't break `tsc --noEmit`
    // and doesn't force everyone in dev to install a heavy parser.
    const mod = (await import("pdf-parse")) as {
      default?: (b: Buffer) => Promise<{ text: string }>;
    };
    const parser = mod.default;
    if (typeof parser === "function") {
      const parsed = await parser(buffer);
      if (parsed?.text) return parsed.text;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[blockid:guest-analysis] pdf-parse unavailable/failed", msg);
  }
  // Extremely rough fallback: pluck ASCII runs from the raw bytes.
  // A real PDF will yield garbled output but at least *some* keywords
  // will survive so the SVI heuristic still fires.
  const ascii = buffer
    .toString("binary")
    .replace(/[^\x20-\x7E\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return ascii;
}

/** Best-effort DOCX text extraction via `mammoth`. Falls back to empty. */
async function extractDocxText(filepath: string): Promise<string> {
  try {
    const mod = (await import("mammoth")) as {
      extractRawText?: (opts: {
        path: string;
      }) => Promise<{ value: string }>;
    };
    if (typeof mod.extractRawText === "function") {
      const result = await mod.extractRawText({ path: filepath });
      return result?.value ?? "";
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[blockid:guest-analysis] mammoth unavailable/failed", msg);
  }
  return "";
}

/**
 * Extract plain text from a PDF or DOCX file on disk.
 *
 * Reused by the pitchdeck coverage-gated analyzer (`/api/pitchdeck/*`).
 * Falls back to a lossy byte-scan if the parser lib isn't available.
 */
export async function extractFileText(
  filepath: string,
  filename: string | null,
): Promise<string> {
  const lowerName = (filename ?? filepath).toLowerCase();
  if (lowerName.endsWith(".pdf")) return extractPdfText(filepath);
  if (lowerName.endsWith(".docx") || lowerName.endsWith(".doc")) {
    return extractDocxText(filepath);
  }
  // Unknown extension — try PDF first (upload route already gated on MIME).
  return extractPdfText(filepath);
}

async function safeUnlink(filepath: string): Promise<void> {
  try {
    await fs.unlink(filepath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      "[blockid:guest-analysis] tmp cleanup failed",
      { filepath, msg },
    );
  }
}

// ── Bucket bootstrap ───────────────────────────────────────────────────────

type SupabaseAdmin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

async function ensureBucket(supabase: SupabaseAdmin): Promise<void> {
  try {
    const { data: existing } = await supabase.storage.getBucket(
      GUEST_REPORT_BUCKET,
    );
    if (existing) return;
  } catch {
    // getBucket errors on 404 — fall through to createBucket.
  }
  try {
    await supabase.storage.createBucket(GUEST_REPORT_BUCKET, {
      public: false,
      fileSizeLimit: 20 * 1024 * 1024, // 20 MB
    });
    console.info(
      `[blockid:guest-analysis] created storage bucket ${GUEST_REPORT_BUCKET}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Ignore "already exists" races — anything else is logged and we
    // proceed; the upload call below will surface the real error.
    if (!/exists|conflict|409/i.test(msg)) {
      console.warn(
        "[blockid:guest-analysis] createBucket failed (continuing)",
        msg,
      );
    }
  }
}

// ── Main entry ─────────────────────────────────────────────────────────────

export async function runGuestAnalysis(
  guestAnalysisId: string,
): Promise<RunResult> {
  const t0 = Date.now();
  console.info(
    `[blockid:guest-analysis] runner start id=${guestAnalysisId}`,
  );

  if (!isSupabaseConfigured()) {
    console.error(
      "[blockid:guest-analysis] supabase not configured — cannot run",
    );
    return { success: false, error: "supabase_not_configured" };
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { success: false, error: "supabase_not_configured" };
  }

  // ── 1. Load the row ─────────────────────────────────────────────────────
  const { data: row, error: fetchErr } = await supabase
    .from("guest_analyses")
    .select(
      "id, email, input_type, input_value, input_filename, status",
    )
    .eq("id", guestAnalysisId)
    .maybeSingle();

  if (fetchErr || !row) {
    const msg = fetchErr?.message ?? "row_not_found";
    console.error(
      "[blockid:guest-analysis] fetch failed",
      { id: guestAnalysisId, msg },
    );
    return { success: false, error: `fetch_failed: ${msg}` };
  }

  if (row.status !== "paid") {
    console.warn(
      "[blockid:guest-analysis] refusing to run — status !== 'paid'",
      { id: guestAnalysisId, status: row.status },
    );
    return {
      success: false,
      error: `invalid_status: expected 'paid', got '${row.status}'`,
    };
  }

  const email = String(row.email ?? "").trim().toLowerCase();
  const inputType = row.input_type as "pitch_file" | "website_url";
  const inputValue = String(row.input_value ?? "");
  const inputFilename = row.input_filename
    ? String(row.input_filename)
    : null;

  // ── 2. Flip to analyzing ────────────────────────────────────────────────
  {
    const { error: updErr } = await supabase
      .from("guest_analyses")
      .update({ status: "analyzing" })
      .eq("id", guestAnalysisId)
      .eq("status", "paid");
    if (updErr) {
      console.error(
        "[blockid:guest-analysis] status→analyzing update failed",
        updErr.message,
      );
      return { success: false, error: `status_flip_failed: ${updErr.message}` };
    }
  }

  try {
    // ── 3. Prepare rawText + input metadata ──────────────────────────────
    let rawText = "";
    let scrapedTitle: string | undefined;
    let scrapedDescription: string | undefined;
    let scrapedText: string | undefined;
    let websiteUrl: string | undefined;
    let uploadedTmpPath: string | null = null;

    if (inputType === "website_url") {
      websiteUrl = inputValue.startsWith("http")
        ? inputValue
        : `https://${inputValue}`;

      const scraped = await withTimeoutSafe(
        "scrapeUrl",
        scrapeUrl(websiteUrl),
        { title: "", description: "", text: "", techHints: [] as string[] },
      );
      scrapedTitle = scraped.title || undefined;
      scrapedDescription = scraped.description || undefined;
      scrapedText = scraped.text || undefined;
      rawText = [
        websiteUrl,
        scraped.title,
        scraped.description,
        scraped.text,
      ]
        .filter(Boolean)
        .join(" ")
        .trim();
    } else if (inputType === "pitch_file") {
      // Reject weird paths — the upload route stores under /tmp/... or
      // /app/guest-uploads/... so path traversal below either of those
      // roots is a red flag.
      const abs = path.resolve(inputValue);
      const okRoot =
        abs.startsWith("/tmp/") ||
        abs.startsWith("/app/guest-uploads/") ||
        abs.startsWith(path.resolve("/tmp") + path.sep);
      if (!okRoot) {
        throw new Error(`input_value outside allowed roots: ${abs}`);
      }
      uploadedTmpPath = abs;
      rawText = await extractFileText(abs, inputFilename);
    } else {
      throw new Error(`unknown input_type: ${String(inputType)}`);
    }

    if (!rawText || rawText.trim().length < 20) {
      throw new Error("empty_input_after_extraction");
    }

    rawText = truncateForModel(rawText);

    // ── 4. Project name ──────────────────────────────────────────────────
    const nameResult = extractProjectName({
      rawText,
      fileName: inputFilename ?? undefined,
      scraped: {
        title: scrapedTitle,
        description: scrapedDescription,
      },
      url: websiteUrl,
    });
    // Compliance rule (per user memory): never let a real startup name from
    // a known brand seed the AI prompt. `extractProjectName` gives us the
    // best local guess — for guests we sanitise it to the email local-part
    // when the extraction confidence is high-but-branded-looking. For now
    // we trust the extractor's own confidence label and fall back to the
    // email local-part when it's "low".
    const emailLocal = email.split("@")[0]?.trim() || "your startup";
    const projectName =
      nameResult.confidence === "low" || !nameResult.name
        ? emailLocal
        : nameResult.name;

    // ── 5. Full SVI pipeline ─────────────────────────────────────────────
    const sourceType = detectInputType(rawText, inputFilename ?? undefined);
    const svInput: SVITextInput = {
      rawText,
      fileName: inputFilename ?? undefined,
    };

    const signals = extractSignals(svInput, inputFilename ?? undefined);
    let analysis: SVIAnalysis = computeSVI(signals);

    // Attach website url early so downstream agents can reason about it.
    if (websiteUrl) {
      analysis = { ...analysis, websiteUrl };
    }

    // Deep valuation — deterministic, no network. Wrap defensively anyway.
    try {
      const deepValuation = buildDeepValuationAnalysis({
        sviAnalysis: analysis,
        rawText,
        scrapedText,
        competitiveIntelligence: null,
      });

      // Maturity guard — flag well-known companies so we never over-value.
      const maturitySignal = detectMaturity({
        url: websiteUrl,
        scrapedTitle,
        scrapedDescription,
        scrapedText,
        rawText,
      });
      const maturityGuard = maturityValuationGuard(maturitySignal);
      const finalValuation =
        maturityGuard.override && maturityGuard.confidenceOverride
          ? {
              ...deepValuation,
              blendedValuation: {
                ...deepValuation.blendedValuation,
                confidence: maturityGuard.confidenceOverride,
              },
              riskFlags: [
                maturityGuard.reason ??
                  "Established company detected — valuation directional only.",
                ...deepValuation.riskFlags,
              ],
            }
          : deepValuation;

      analysis = {
        ...analysis,
        deepValuation: finalValuation,
        maturitySignal,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        "[blockid:guest-analysis] deepValuation failed — continuing",
        msg,
      );
    }

    // Cohort percentile (real cohort when ≥20 same-stage snapshots).
    const cohort = await withTimeoutSafe(
      "computeCohortPercentile",
      computeCohortPercentile({
        sviScore: analysis.totalSVI,
        stage: analysis.stage ?? 0,
        fallbackPercentile: analysis.percentileRank ?? 50,
      }),
      null,
      15_000,
    );
    if (cohort) {
      analysis = {
        ...analysis,
        cohortPercentile: cohort,
        ...(cohort.source === "real_cohort"
          ? { percentileRank: cohort.percentile }
          : {}),
      };
    }

    // Antler-style stage-progression signals — deterministic.
    try {
      analysis = {
        ...analysis,
        antlerSignals: evaluateAntlerSignals({
          analysis,
          signals,
          rawText,
          ci: null,
        }),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        "[blockid:guest-analysis] antlerSignals failed — continuing",
        msg,
      );
    }

    // Input summary — mirrors what /api/svi/route.ts attaches.
    const inputSnippet = (scrapedDescription || rawText)
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 280);
    const keyFindings: string[] = [];
    if (scrapedTitle) keyFindings.push(`Page title: "${scrapedTitle}"`);
    if (analysis.sector) {
      keyFindings.push(
        `Detected sector: ${analysis.sectorLabel ?? analysis.sector}`,
      );
    }
    analysis = {
      ...analysis,
      inputSummary: {
        projectName,
        projectNameSource: nameResult.source,
        projectNameConfidence: nameResult.confidence,
        sourceType,
        snippet: inputSnippet,
        keyFindings: keyFindings.slice(0, 5),
        scrapedTitle,
        scrapedDescription,
      },
    };

    // ── 6. Assemble the report_data JSON (ScoreApiResponse-ish shape) ────
    const fundingReadiness = computeFundingReadiness(analysis);
    const subScores: Record<string, number> = {};
    for (const s of analysis.subs) subScores[s.key] = s.value;

    const reportData = {
      ok: true,
      guestAnalysisId,
      totalScore: analysis.totalSVI,
      subScores,
      scoreVersion: analysis.version,
      confidenceScore: analysis.confidenceMultiplier,
      missingInputs: analysis.evidenceGaps.map((g) => g.label),
      actionPlan: analysis.nextActions.map((a) => ({
        title: a.title,
        detail: a.detail,
        impact: (a.priority === "P0"
          ? "high"
          : a.priority === "P1"
            ? "medium"
            : "low") as "high" | "medium" | "low",
      })),
      benchmark: {
        label: analysis.stageLabel,
        medianScore: 100,
        band: analysis.stageLabel,
        rationale: analysis.summary,
      },
      valuation: analysis.deepValuation ?? null,
      fundingReadiness,
      analysis,
      generatedAt: new Date().toISOString(),
    };

    // ── 7. PDF generation + upload ───────────────────────────────────────
    let reportPdfUrl: string | null = null;
    try {
      const pdfBuffer = await renderToBuffer(
        SVIReportPDF({
          analysis,
          startupName: projectName,
          email,
          tier: "standard",
        }),
      );

      await ensureBucket(supabase);

      const storagePath = `${guestAnalysisId}/report.pdf`;
      const uploadRes = await supabase.storage
        .from(GUEST_REPORT_BUCKET)
        .upload(storagePath, Buffer.from(pdfBuffer), {
          contentType: "application/pdf",
          upsert: true,
        });
      if (uploadRes.error) {
        throw new Error(`upload failed: ${uploadRes.error.message}`);
      }

      const signed = await supabase.storage
        .from(GUEST_REPORT_BUCKET)
        .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
      reportPdfUrl = signed.data?.signedUrl ?? null;

      if (!reportPdfUrl) {
        // Fallback: at least record the storage path so the delivery
        // email or an admin can regenerate a signed URL on demand.
        console.warn(
          "[blockid:guest-analysis] createSignedUrl returned no url — storing path only",
        );
        reportPdfUrl = storagePath;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        "[blockid:guest-analysis] PDF/storage failed — delivering without PDF",
        msg,
      );
    }

    // ── 8. Persist + flip to delivered ───────────────────────────────────
    const { error: writeErr } = await supabase
      .from("guest_analyses")
      .update({
        report_data: reportData,
        report_pdf_url: reportPdfUrl,
        status: "delivered",
        delivered_at: new Date().toISOString(),
      })
      .eq("id", guestAnalysisId)
      .eq("status", "analyzing");

    if (writeErr) {
      throw new Error(`persist_failed: ${writeErr.message}`);
    }

    // ── 9. Email hand-off (Phase 5 stub) ─────────────────────────────────
    try {
      await sendGuestReport({
        email,
        reportData,
        pdfUrl: reportPdfUrl ?? "",
        guestAnalysisId,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        "[blockid:guest-analysis] sendGuestReport threw — non-fatal",
        msg,
      );
    }

    // ── 10. Cleanup ──────────────────────────────────────────────────────
    if (uploadedTmpPath) {
      await safeUnlink(uploadedTmpPath);
    }

    const dt = Date.now() - t0;
    console.info(
      `[blockid:guest-analysis] runner done id=${guestAnalysisId} in ${dt}ms svi=${analysis.totalSVI}`,
    );
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      "[blockid:guest-analysis] runner FAILED",
      { id: guestAnalysisId, msg },
    );
    await supabase
      .from("guest_analyses")
      .update({
        status: "failed",
        error_message: msg.slice(0, 500),
      })
      .eq("id", guestAnalysisId);
    return { success: false, error: msg };
  }
}
