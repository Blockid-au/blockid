// Pitch-deck coverage classifier — the core of POST /api/pitchdeck/classify,
// extracted (G14 S35) so the program-intake submission runner can classify
// an anonymous founder's deck without an HTTP round-trip.
//
// Pipeline: deck text (already extracted, or extracted here from a PDF /
// DOCX on disk) → one cheap-tier LLM call that labels each of the 8 SVI
// dimensions `strong` / `partial` / `missing` with a ≤120-char excerpt →
// optional `pitchdeck_analyses` row (status "classified") so the founder
// flow can hand the id to /api/pitchdeck/analyze.
//
// Pure helpers (`classifyPrompt`, `safeParseCoverage`, `coverageSummary`)
// carry no I/O and are what the colocated test pins. `classifyDeck()` takes
// its AI + DB dependencies through `deps` so callers/tests can stub them.
//
// No `server-only`: the runner's test imports this module directly.

import { promises as fs } from "node:fs";
import path from "node:path";

import { safeParseCoverage, type CoverageMap } from "./coverage";

// The 8-dimension vocabulary + pure parse / summary helpers live in the
// client-safe ./coverage module (the inbox heat strip imports it from a
// "use client" file; this module pulls in ai-client → supabase lazily).
export { DIM_KEYS, coverageSummary, safeParseCoverage } from "./coverage";
export type { CoverageLevel, CoverageMap, DimCoverage, DimKey } from "./coverage";

/** Cap the LLM prompt at ~30 KiB so we stay in the fast tier's context. */
export const MAX_TEXT_BYTES = 30_000;
/** Minimum extracted text before we bother the model. */
export const MIN_TEXT_CHARS = 40;
/** `pitchdeck_analyses.extracted_text` cap. */
export const STORED_TEXT_CHARS = 40_000;

/** Where /api/upload, the guest flow and the intake runner persist files. */
export const UPLOAD_ROOTS = ["/app/uploads", "/app/guest-uploads", "/tmp/guest-uploads", "/app/intake-uploads", "/tmp/intake-uploads"];

export function classifyPrompt(text: string): string {
  return `You are the intake analyst at BlockID's Startup Value Index.

For each of the 8 SVI dimensions below, decide whether the deck excerpt
contains STRONG evidence, PARTIAL evidence, or is MISSING that dimension
entirely. Also grab a short (≤120 char) excerpt from the deck that most
directly justifies the label — empty string if MISSING.

Return VALID JSON ONLY (no markdown fence, no prose) matching this shape:
{
  "ftv": {"level":"strong|partial|missing","excerpt":"..."},
  "mpc": {"level":"strong|partial|missing","excerpt":"..."},
  "ptd": {"level":"strong|partial|missing","excerpt":"..."},
  "tre": {"level":"strong|partial|missing","excerpt":"..."},
  "cgh": {"level":"strong|partial|missing","excerpt":"..."},
  "iri": {"level":"strong|partial|missing","excerpt":"..."},
  "lco": {"level":"strong|partial|missing","excerpt":"..."},
  "svm": {"level":"strong|partial|missing","excerpt":"..."}
}

Dimension keys:
- ftv  Founder & Team (bios, prior exits, domain expertise)
- mpc  Market & Problem (TAM/SAM/SOM, pain, segment, timing)
- ptd  Product & Tech (differentiation, moat, stage, scalability)
- tre  Traction & Revenue (revenue, growth, DAU/MAU, retention, pipeline)
- cgh  Cap Table & Governance (equity, vesting, board, investors)
- iri  Investor Readiness (data room, deck quality, prior raises)
- lco  Legal & Compliance (incorporation, IP, regulatory, contracts)
- svm  Strategic Vision & Moat (long-term defensibility, network effects)

Deck excerpt:
---
${text.slice(0, MAX_TEXT_BYTES)}
---`;
}

/**
 * Accept either an absolute filesystem path (guest / intake uploads) or a
 * public URL path under /uploads/... served from disk. Only allow reads from
 * known upload roots — never let a caller probe arbitrary paths on the host.
 */
export async function resolveUploadedFilepath(storageUrl: string): Promise<string | null> {
  if (storageUrl.startsWith("/") && !storageUrl.startsWith("//")) {
    const abs = path.resolve(storageUrl);
    for (const root of UPLOAD_ROOTS) {
      if (abs.startsWith(root + path.sep) || abs === root) {
        try {
          await fs.access(abs);
          return abs;
        } catch {
          return null;
        }
      }
    }
    // Fall through — might be a web path like /uploads/foo.pdf.
    if (abs.startsWith("/uploads/") || abs.startsWith("/public/uploads/")) {
      const candidate = path.join("/app", abs.replace(/^\/(public\/)?/, ""));
      try {
        await fs.access(candidate);
        return candidate;
      } catch {
        return null;
      }
    }
  }
  return null;
}

// ── classifyDeck ────────────────────────────────────────────────────────────

export interface ClassifyDeckInput {
  /** Already-extracted text (paste flow / runner). Wins over `filepath`. */
  text?: string | null;
  /** Absolute path under UPLOAD_ROOTS (or a /uploads/... web path). */
  filepath?: string | null;
  /** Original filename — picks the PDF vs DOCX extractor. */
  filename?: string | null;
  /** Owner of the `pitchdeck_analyses` row; null = do not persist. */
  userId?: string | null;
  projectId?: string | null;
  /** Stored on the row as `storage_url` (what the caller handed us). */
  storageUrl?: string | null;
}

export type ClassifyDeckError =
  | "storage_not_found_or_disallowed"
  | "extraction_failed"
  | "extracted_text_too_short"
  | "classification_ai_failed"
  | "classification_parse_failed";

export type ClassifyDeckResult =
  | {
      ok: true;
      coverage: CoverageMap;
      textBytes: number;
      text: string;
      /** null when nothing was persisted (no userId / no DB / insert failed — see `warnings`). */
      pitchdeckId: string | null;
      warnings: string[];
    }
  | { ok: false; error: ClassifyDeckError; detail?: string };

export interface ClassifyDeckDeps {
  /** Cheap-tier LLM call. Default = `callAI` from @/lib/ai-client. */
  callAI?: (args: { system: string; user: string; maxTokens: number; timeoutMs: number }) => Promise<{ text: string }>;
  /** Text extractor for PDF / DOCX on disk. Default = guest-analysis runner. */
  extractFileText?: (filepath: string, filename: string | null) => Promise<string>;
  /** Persist the classified row; return its id. Default = Supabase admin insert. */
  persist?: (row: Record<string, unknown>) => Promise<string | null>;
}

async function defaultPersist(row: Record<string, unknown>): Promise<string | null> {
  const { getSupabaseAdmin } = await import("@/lib/supabase");
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase.from("pitchdeck_analyses").insert(row).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "persist_failed");
  return String((data as { id: unknown }).id);
}

/**
 * Classify a deck's SVI coverage. Never throws for the optional persist
 * step (recorded in `warnings`); extraction / AI failures come back as
 * `{ ok: false, error }` so HTTP callers can map them to a status.
 */
export async function classifyDeck(input: ClassifyDeckInput, deps: ClassifyDeckDeps = {}): Promise<ClassifyDeckResult> {
  const warnings: string[] = [];
  let text = typeof input.text === "string" ? input.text : "";

  if (!text && input.filepath) {
    const resolved = await resolveUploadedFilepath(input.filepath);
    if (!resolved) return { ok: false, error: "storage_not_found_or_disallowed" };
    try {
      const extract = deps.extractFileText ?? (await import("@/lib/guest-analysis/runner")).extractFileText;
      text = await extract(resolved, input.filename ?? null);
    } catch (err) {
      return { ok: false, error: "extraction_failed", detail: err instanceof Error ? err.message.slice(0, 200) : "unknown" };
    }
  }

  text = text.trim();
  if (text.length < MIN_TEXT_CHARS) return { ok: false, error: "extracted_text_too_short" };
  const textBytes = Buffer.byteLength(text, "utf8");

  let coverage: CoverageMap;
  try {
    const ai = deps.callAI ?? (await import("@/lib/ai-client")).callAI;
    const result = await ai({
      system: "You are a precise startup analyst. Reply with strict JSON only.",
      user: classifyPrompt(text),
      maxTokens: 1200,
      timeoutMs: 45_000,
    });
    const parsed = safeParseCoverage(result.text);
    if (!parsed) return { ok: false, error: "classification_parse_failed" };
    coverage = parsed;
  } catch (err) {
    return {
      ok: false,
      error: "classification_ai_failed",
      detail: err instanceof Error ? err.message.slice(0, 200) : "unknown",
    };
  }

  let pitchdeckId: string | null = null;
  if (input.userId) {
    try {
      const persist = deps.persist ?? defaultPersist;
      pitchdeckId = await persist({
        user_id: input.userId,
        project_id: input.projectId ?? null,
        filename: (input.filename ?? "pitchdeck.pdf").slice(0, 200),
        storage_url: input.storageUrl ?? "",
        extracted_text: text.slice(0, STORED_TEXT_CHARS),
        text_bytes: textBytes,
        dim_coverage: coverage,
        selected_dims: [],
        credits_spent: 0,
        final_svi: null,
        status: "classified",
      });
      if (!pitchdeckId) warnings.push("persist_skipped");
    } catch (err) {
      warnings.push(`persist_failed: ${err instanceof Error ? err.message.slice(0, 120) : "unknown"}`);
    }
  }

  return { ok: true, coverage, textBytes, text, pitchdeckId, warnings };
}
