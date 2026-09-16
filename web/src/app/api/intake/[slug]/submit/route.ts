// POST /api/intake/[slug]/submit — public founder application (G14 S35, D2).
//
// multipart/form-data: startup_name, founder_name?, founder_email, website?,
// consent ("on" | "true"), deck (PDF / DOCX ≤ 25 MB), and the honeypot
// field `company_website_confirm` (must stay empty — a bot that fills it
// gets a silent 204 and nothing is stored).
//
//   200 { ok, submission_id, status }      received | scored
//   204                                     honeypot tripped (silent)
//   400 invalid_input | consent_required | deck_required
//   404 not_found | closed (+ reason) | not_migrated   (unknown / closed / not applied)
//   409 duplicate                           same founder email on this intake
//   413 deck_too_large · 415 deck_type · 422 deck_infected · 429 rate limit
//   503 scanner_unavailable | service_unavailable
//
// Rate limit: 5 per hour per IP (`enforceRateLimit("intake-submit", null, …)`).
// Multipart is read once; a body we cannot parse is a 400. The multipart
// hard cap (26 MB) is applied on Content-Length before the body is read so
// a 2 GB upload never reaches formData().

import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/audit/api-route";
import { enforceRateLimit } from "@/lib/rate-limit";
import { isIntakeSlug } from "@/lib/intake/program-intakes";
import {
  DECK_MAX_BYTES,
  HONEYPOT_FIELD,
  SUBMISSION_HTTP_STATUS,
  runIntakeSubmission,
  type DeckInput,
} from "@/lib/intake/submission-runner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export const RATE_MAX = 5;
export const RATE_WINDOW_MS = 60 * 60 * 1000;
const BODY_HARD_CAP = DECK_MAX_BYTES + 1024 * 1024;

type Ctx = { params: Promise<{ slug: string }> };

function clientIp(request: Request): string | null {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null
  );
}

const text = (v: FormDataEntryValue | null): string | null => (typeof v === "string" ? v : null);

async function POST_handler(request: Request, { params }: Ctx) {
  const { slug } = await params;
  if (!isIntakeSlug(slug)) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const limited = enforceRateLimit("intake-submit", null, request, RATE_MAX, RATE_WINDOW_MS);
  if (limited) return limited;

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > BODY_HARD_CAP) {
    return NextResponse.json({ ok: false, error: "deck_too_large", message: `Deck must be under ${DECK_MAX_BYTES / 1024 / 1024} MB` }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_input", message: "Expected multipart/form-data" }, { status: 400 });
  }

  // Honeypot: humans never see the field; a filled value is a bot → silent 204.
  if ((text(form.get(HONEYPOT_FIELD)) ?? "").trim()) return new NextResponse(null, { status: 204 });

  let deck: DeckInput | null = null;
  const file = form.get("deck");
  if (file instanceof File && file.size > 0) {
    if (file.size > DECK_MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "deck_too_large", message: `Deck must be under ${DECK_MAX_BYTES / 1024 / 1024} MB` }, { status: 413 });
    }
    deck = { buffer: Buffer.from(await file.arrayBuffer()), filename: (file.name || "deck.pdf").slice(0, 200), mimeType: file.type, size: file.size };
  }

  const result = await runIntakeSubmission({
    slug,
    startupName: text(form.get("startup_name")),
    founderName: text(form.get("founder_name")),
    founderEmail: text(form.get("founder_email")),
    website: text(form.get("website")),
    consent: text(form.get("consent")),
    deck,
    ip: clientIp(request),
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, message: result.message, ...(result.reason ? { reason: result.reason } : {}) },
      { status: SUBMISSION_HTTP_STATUS[result.error] },
    );
  }
  return NextResponse.json({ ok: true, submission_id: result.submissionId, status: result.status }, { status: 200 });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/intake/[slug]/submit/route.ts", method: "POST" }, POST_handler);
