// POST /api/founder-profile/import-linkedin — "Import from LinkedIn PDF"
// on the founder profile Execution tab (G14-S37).
//
// Feature-detects the S-R5 parser (lib/connectors/linkedin-upload.ts) with a
// dynamic import — never a hard dependency: when the module is absent the
// route answers 501 `parser_unavailable` and the button says so. When it is
// present the founder-uploaded "Save to PDF" export (≤ 5 MB) is parsed and
// the STRUCTURED prefill is returned for the form to apply — nothing is
// written here (the founder reviews, then saves through POST
// /api/founder-profile with execution_source[field] = "linkedin_parser").
// The PDF and its raw text are never stored (data principle).

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { apiRoute } from "@/lib/audit/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const MAX_PDF_BYTES = 5 * 1024 * 1024;

export interface LinkedInPrefill {
  years_in_domain: number | null;
  years_experience: number | null;
  prev_employers: string[];
  exits: number;
  full_name: string | null;
  headline: string | null;
  linkedin_url: string | null;
  /** The fields the parser could fill — the form stamps execution_source[field] = "linkedin_parser". */
  filled: string[];
  confidence: number;
}

type Parser = typeof import("@/lib/connectors/linkedin-upload");

/** null when the S-R5 module is not shipped in this build. */
export async function loadParser(): Promise<Parser | null> {
  try {
    const mod = await import("@/lib/connectors/linkedin-upload");
    return typeof mod.parseLinkedInPdf === "function" ? mod : null;
  } catch {
    return null;
  }
}

export function toPrefill(signals: { yearsInDomain: number | null; yearsExperience: number | null; priorCompanies: string[]; exits: number; founderName: string | null; headline: string | null; profileUrl: string | null; confidence: number }): LinkedInPrefill {
  const years = signals.yearsInDomain ?? signals.yearsExperience;
  const filled: string[] = [];
  if (years != null) filled.push("years_in_domain");
  if (signals.priorCompanies.length) filled.push("prev_employers");
  if (signals.exits > 0) filled.push("prior_exits");
  if (signals.founderName) filled.push("full_name");
  if (signals.profileUrl) filled.push("linkedin_url");
  return {
    years_in_domain: years == null ? null : Math.max(0, Math.min(60, Math.round(years))),
    years_experience: signals.yearsExperience,
    prev_employers: signals.priorCompanies.slice(0, 20),
    exits: signals.exits,
    full_name: signals.founderName,
    headline: signals.headline,
    linkedin_url: signals.profileUrl,
    filled,
    confidence: signals.confidence,
  };
}

async function POST_handler(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const parser = await loadParser();
  if (!parser) return NextResponse.json({ ok: false, error: "parser_unavailable" }, { status: 501 });

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_PDF_BYTES + 64 * 1024) return NextResponse.json({ ok: false, error: "pdf_too_large" }, { status: 413 });
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_form" }, { status: 400 });
  }
  const file = form.get("file");
  const profileUrl = typeof form.get("profileUrl") === "string" ? String(form.get("profileUrl")) : null;
  if (!file || typeof file !== "object" || !("arrayBuffer" in file)) return NextResponse.json({ ok: false, error: "file_required" }, { status: 400 });
  const f = file as File;
  if (f.size > MAX_PDF_BYTES) return NextResponse.json({ ok: false, error: "pdf_too_large" }, { status: 413 });
  const buf = Buffer.from(await f.arrayBuffer());
  if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") return NextResponse.json({ ok: false, error: "pdf_only" }, { status: 415 });

  const url = profileUrl && profileUrl.trim() ? parser.normaliseLinkedInUrl(profileUrl) : null;
  const parsed = await parser.parseLinkedInPdf(buf, { profileUrl: url });
  if (parsed.extractedChars < 40) {
    return NextResponse.json({ ok: false, error: "pdf_no_text", detail: "The PDF has no extractable text — export again from LinkedIn (Profile → More → Save to PDF)." }, { status: 422 });
  }
  return NextResponse.json({ ok: true, prefill: toPrefill(parsed), extracted: { chars: parsed.extractedChars, engine: parsed.engine } });
}

// S20-A — audited via apiRoute; the PDF and its text are never persisted.
export const POST = apiRoute({ route: "api/founder-profile/import-linkedin/route.ts", method: "POST", action: "founder_profile.linkedin_import", entity: "founder_profiles" }, POST_handler);
