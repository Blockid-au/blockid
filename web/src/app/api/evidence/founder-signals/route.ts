// /api/evidence/founder-signals — the LinkedIn evidence step (G13-W5-R5 /
// S-R5, spec §C.7 row 1).
//
//   GET   latest parsed founder signals for the active project (viewer+).
//   POST  editor+. Either multipart/form-data with `file` (the LinkedIn
//         "Save to PDF" export, ≤ 5 MB, application/pdf) and optional
//         `profileUrl`, or JSON `{ text?, profileUrl? }` (pasted profile
//         text and / or the profile URL). At least one of file / text /
//         profileUrl is required. The parsed FounderSignals row is written
//         to `founder_signals` under the project (never the raw text or the
//         PDF — data principle) and the FTV chapter reads it on the next
//         report. The URL is validated + stored only; nothing is fetched.
//
// 503 with reason `not_migrated` when 0402 is not applied.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { apiRoute, auditNote } from "@/lib/audit/api-route";
import { projectScopeOrDeny } from "@/lib/project-members/http";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  loadLatestFounderSignals,
  normaliseLinkedInUrl,
  parseLinkedInPdf,
  parseLinkedInText,
  parseLinkedInUrl,
  saveFounderSignals,
  type FounderSignals,
  type FounderSignalsDb,
} from "@/lib/connectors/linkedin-upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const MAX_PDF_BYTES = 5 * 1024 * 1024;
export const MAX_TEXT_CHARS = 60_000;

/** Sector words the "years in domain" heuristic matches roles against. */
export function domainKeywordsFor(industry: string | null | undefined): string[] {
  if (!industry) return [];
  return industry
    .toLowerCase()
    .split(/[\s/,&+-]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 4 && !["tech", "technology", "startup", "other", "general", "services"].includes(w));
}

function publicSignals(s: FounderSignals) {
  return {
    source: s.source,
    profileUrl: s.profileUrl,
    founderName: s.founderName,
    headline: s.headline,
    currentRole: s.currentRole,
    yearsExperience: s.yearsExperience,
    yearsInDomain: s.yearsInDomain,
    priorCompanies: s.priorCompanies,
    exits: s.exits,
    teamSizeOnPage: s.teamSizeOnPage,
    roles: s.roles.map((r) => ({ company: r.company, title: r.title, start: r.start, end: r.end, current: r.current, exit: r.exit })),
    education: s.education,
    confidence: s.confidence,
    parsedAt: s.parsedAt,
  };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { scope, denied } = await projectScopeOrDeny("viewer");
  if (denied) return denied;
  if (!scope) return NextResponse.json({ ok: true, signals: null });
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, error: "supabase_unavailable" }, { status: 503 });
  const signals = await loadLatestFounderSignals(db as unknown as FounderSignalsDb, scope.projectId);
  return NextResponse.json({ ok: true, signals: signals ? publicSignals(signals) : null });
}

async function readInput(request: Request): Promise<{ ok: true; pdf: Buffer | null; text: string | null; profileUrl: string | null } | { ok: false; status: number; error: string }> {
  const ct = request.headers.get("content-type") ?? "";
  // Refuse oversized bodies BEFORE buffering them (W5 review): the size
  // checks below run after formData()/json() had already read up to nginx's
  // 50 MB. Multipart overhead is small, so cap at the PDF limit + 64 KB.
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_PDF_BYTES + 64 * 1024) return { ok: false, status: 413, error: "pdf_too_large" };
  if (ct.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return { ok: false, status: 400, error: "invalid_form" };
    }
    const file = form.get("file");
    const profileUrl = typeof form.get("profileUrl") === "string" ? String(form.get("profileUrl")) : null;
    const text = typeof form.get("text") === "string" ? String(form.get("text")) : null;
    if (file && typeof file === "object" && "arrayBuffer" in file) {
      const f = file as File;
      if (f.size > MAX_PDF_BYTES) return { ok: false, status: 413, error: "pdf_too_large" };
      const type = (f.type || "").toLowerCase();
      if (type && type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) return { ok: false, status: 415, error: "pdf_only" };
      const buf = Buffer.from(await f.arrayBuffer());
      if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") return { ok: false, status: 415, error: "pdf_only" };
      return { ok: true, pdf: buf, text: text?.slice(0, MAX_TEXT_CHARS) ?? null, profileUrl };
    }
    return { ok: true, pdf: null, text: text?.slice(0, MAX_TEXT_CHARS) ?? null, profileUrl };
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, status: 400, error: "invalid_json" };
  }
  if (!body || typeof body !== "object") return { ok: false, status: 400, error: "invalid_json" };
  const b = body as { text?: unknown; profileUrl?: unknown };
  const text = typeof b.text === "string" ? b.text.slice(0, MAX_TEXT_CHARS) : null;
  const profileUrl = typeof b.profileUrl === "string" ? b.profileUrl : null;
  return { ok: true, pdf: null, text, profileUrl };
}

async function POST_handler(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { scope, denied } = await projectScopeOrDeny("editor");
  if (denied) return denied;
  if (!scope) return NextResponse.json({ ok: false, error: "no_project" }, { status: 400 });

  const input = await readInput(request);
  if (!input.ok) return NextResponse.json({ ok: false, error: input.error }, { status: input.status });

  const url = input.profileUrl?.trim() ? normaliseLinkedInUrl(input.profileUrl) : null;
  if (input.profileUrl?.trim() && !url) return NextResponse.json({ ok: false, error: "invalid_linkedin_url" }, { status: 400 });
  if (!input.pdf && !input.text?.trim() && !url) return NextResponse.json({ ok: false, error: "nothing_to_parse" }, { status: 400 });

  const domainKeywords = domainKeywordsFor((scope.project as { industry?: string | null }).industry);
  let signals: FounderSignals;
  let extracted: { chars: number; engine: string } | null = null;
  if (input.pdf) {
    const r = await parseLinkedInPdf(input.pdf, { domainKeywords, profileUrl: url });
    extracted = { chars: r.extractedChars, engine: r.engine };
    signals = r;
    if (r.extractedChars < 40) return NextResponse.json({ ok: false, error: "pdf_no_text", detail: "The PDF has no extractable text — export again from LinkedIn (Profile → More → Save to PDF) or paste the profile text." }, { status: 422 });
  } else if (input.text?.trim()) {
    signals = parseLinkedInText(input.text, { domainKeywords, profileUrl: url });
  } else {
    signals = parseLinkedInUrl(url!)!;
  }

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, error: "supabase_unavailable" }, { status: 503 });
  const saved = await saveFounderSignals(db as unknown as FounderSignalsDb, scope.projectId, signals);
  if (!saved.ok) {
    const notMigrated = /does not exist|schema cache/i.test(saved.error);
    return NextResponse.json({ ok: false, error: notMigrated ? "not_migrated" : "save_failed", detail: saved.error }, { status: notMigrated ? 503 : 500 });
  }

  auditNote(saved.id ?? scope.projectId, { source: signals.source, roles: signals.roles.length, exits: signals.exits, confidence: signals.confidence, extracted_chars: extracted?.chars ?? null });
  return NextResponse.json({ ok: true, id: saved.id, signals: publicSignals(signals), extracted }, { status: 201 });
}

// S20-A — audited via apiRoute; action + entity overridden inline.
export const POST = apiRoute({ route: "api/evidence/founder-signals/route.ts", method: "POST", action: "evidence.founder_signals_parsed", entity: "founder_signals" }, POST_handler);
