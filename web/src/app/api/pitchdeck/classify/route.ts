// POST /api/pitchdeck/classify
//
// Wave 11 step 1 — coverage-gated pitchdeck analysis.
//
// Founder uploads a deck via /api/upload (existing) and then hands us the
// storage path + filename. We extract the raw text (pdf-parse / mammoth),
// ask a cheap-tier LLM to classify each of the 8 SVI dimensions as
// `strong` / `partial` / `missing`, persist the row to
// `pitchdeck_analyses`, and return the coverage map + row id so the client
// can render the coverage heatmap + gate the follow-on analyze step.

import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { callAI } from "@/lib/ai-client";
import { extractFileText } from "@/lib/guest-analysis/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Kept in sync with DIM_META in the streaming analyzer.
const DIM_KEYS = ["ftv", "mpc", "ptd", "tre", "cgh", "iri", "lco", "svm"] as const;
type DimKey = (typeof DIM_KEYS)[number];
type CoverageLevel = "strong" | "partial" | "missing";

interface DimCoverage {
  level: CoverageLevel;
  excerpt: string;
}
type CoverageMap = Record<DimKey, DimCoverage>;

// Cap the LLM prompt at ~30 KiB so we stay in the fast tier's context.
const MAX_TEXT_BYTES = 30_000;
// Where /api/upload persists founder uploads (see /api/upload/route.ts).
const UPLOAD_ROOTS = ["/app/uploads", "/app/guest-uploads", "/tmp/guest-uploads"];

function classifyPrompt(text: string): string {
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

function safeParseCoverage(raw: string): CoverageMap | null {
  // Strip a leading markdown fence in case the LLM disobeys the "no fence" rule.
  const cleaned = raw
    .replace(/^\s*```(?:json)?\s*\n/, "")
    .replace(/\n```\s*$/, "")
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  const out: Partial<CoverageMap> = {};
  for (const key of DIM_KEYS) {
    const entry = obj[key];
    if (!entry || typeof entry !== "object") {
      out[key] = { level: "missing", excerpt: "" };
      continue;
    }
    const e = entry as Record<string, unknown>;
    const rawLevel = String(e.level ?? "missing").toLowerCase();
    const level: CoverageLevel =
      rawLevel === "strong" || rawLevel === "partial" || rawLevel === "missing"
        ? (rawLevel as CoverageLevel)
        : "missing";
    const excerpt = typeof e.excerpt === "string" ? e.excerpt.slice(0, 120) : "";
    out[key] = { level, excerpt };
  }
  return out as CoverageMap;
}

async function resolveUploadedFilepath(storageUrl: string): Promise<string | null> {
  // Accept either an absolute filesystem path (guest uploads) or a public
  // URL under /uploads/... served from disk. Only allow reads from known
  // upload roots — never let a user probe arbitrary paths on the host.
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

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    filename?: string;
    storageUrl?: string;
    projectId?: string | null;
    rawText?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const filename = (body.filename ?? "pitchdeck.pdf").slice(0, 200);
  const projectId = body.projectId ?? null;
  const storageUrl = body.storageUrl ?? "";

  // Prefer raw text if the caller already has it (paste-from-clipboard flow).
  // Otherwise resolve the upload path and extract PDF/DOCX text.
  let text = typeof body.rawText === "string" ? body.rawText : "";
  if (!text && storageUrl) {
    const resolved = await resolveUploadedFilepath(storageUrl);
    if (!resolved) {
      return NextResponse.json(
        { ok: false, error: "storage_not_found_or_disallowed" },
        { status: 400 },
      );
    }
    try {
      text = await extractFileText(resolved, filename);
    } catch {
      return NextResponse.json(
        { ok: false, error: "extraction_failed" },
        { status: 500 },
      );
    }
  }

  text = text.trim();
  if (text.length < 40) {
    return NextResponse.json(
      { ok: false, error: "extracted_text_too_short" },
      { status: 400 },
    );
  }
  const textBytes = Buffer.byteLength(text, "utf8");

  // Fast-tier classification — this call must be cheap; the founder pays
  // for the deep dim analyses separately in step 2.
  let coverage: CoverageMap;
  try {
    const result = await callAI({
      system:
        "You are a precise startup analyst. Reply with strict JSON only.",
      user: classifyPrompt(text),
      maxTokens: 1200,
      timeoutMs: 45_000,
    });
    const parsed = safeParseCoverage(result.text);
    if (!parsed) {
      return NextResponse.json(
        { ok: false, error: "classification_parse_failed" },
        { status: 502 },
      );
    }
    coverage = parsed;
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "classification_ai_failed",
        detail: err instanceof Error ? err.message.slice(0, 200) : "unknown",
      },
      { status: 502 },
    );
  }

  // Persist the classified row so the client can hand the id to
  // /api/pitchdeck/analyze on the next step.
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_unavailable" }, { status: 500 });
  }
  const { data: inserted, error: insertErr } = await supabase
    .from("pitchdeck_analyses")
    .insert({
      user_id: user.id,
      project_id: projectId,
      filename,
      storage_url: storageUrl,
      extracted_text: text.slice(0, 40_000),
      text_bytes: textBytes,
      dim_coverage: coverage,
      selected_dims: [],
      credits_spent: 0,
      final_svi: null,
      status: "classified",
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    return NextResponse.json(
      { ok: false, error: "persist_failed", detail: insertErr?.message ?? "" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    pitchdeckId: inserted.id,
    coverage,
    textBytes,
  });
}
