/**
 * /api/listing/readiness/pdf — the listing readiness checklist as a PDF (S29-A).
 *
 * Gate / cost (same rails as board resolutions, S26-B): editor+ on the
 * active project; the equity add-on (`esop.manage`) or Growth+ / Startup
 * Package → included; otherwise `FEATURE_COSTS.listing_readiness_pdf`
 * (1 credit) charged ONCE per project to the CALLER and stamped on
 * `listing_profiles.pdf_credits_charged` — every later download of either
 * exchange is free. The price is shown before anything is spent.
 *
 *   GET  ?exchange=asx|nasdaq[&for=<recipient>]
 *        200 application/pdf when the export is included or already paid;
 *        402 { error: "payment_required", cost, listedCost, balance, creditNote }
 *        otherwise — the page then shows the price and calls POST.
 *   POST { exchange, confirm?: boolean, for?: string }
 *        confirm !== true → 200 { preview: true, cost, listedCost, included, alreadyCharged, balance, creditNote }
 *        confirm === true → spends (when due), stamps the charge, 200 application/pdf.
 *        A render failure AFTER a spend refunds and un-stamps nothing (the
 *        stamp is written only after a successful render).
 *
 *   401 unauthorized  400 exchange  402 insufficient_credits | credit_spend_failed
 *   403/404 scope  429 rate_limited  503 service_unavailable
 */

import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { projectScopeOrDeny } from "@/lib/project-members/http";
import { creditChargeNote } from "@/lib/projects";
import { enforceRateLimit } from "@/lib/rate-limit";
import { readJsonBody } from "@/lib/security/request-guards";
import { canAfford, grantCredits, spendCredits, FEATURE_COSTS } from "@/lib/credits";
import { apiRoute } from "@/lib/audit/api-route";
import { watermarkLabel } from "@/lib/pdf/watermark";
import { renderListingReadinessPdf } from "@/lib/pdf/listing-readiness-pdf";
import { listingPdfIncluded } from "@/lib/listing/gate";
import { loadListingFactsForScope, markListingPdfCharged, type ListingScope } from "@/lib/listing/server";
import { buildListingReadiness, isExchange, scoreReadiness, type Exchange } from "@/lib/listing/readiness";
import type { ProjectScope } from "@/lib/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const FEATURE_KEY = "listing_readiness_pdf";
const RATE_LIMIT_PER_HOUR = 30;
const BODY_MAX_BYTES = 2 * 1024;

function toListingScope(scope: ProjectScope): ListingScope {
  return { projectId: scope.projectId, ownerUserId: scope.ownerUserId, dataEmail: scope.dataEmail, project: { name: scope.project.name, stage: scope.project.stage ?? null, industry: scope.project.industry ?? null } };
}

async function renderForScope(supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>, scope: ProjectScope, exchange: Exchange, callerEmail: string, recipient: string | null): Promise<{ buffer: Buffer; watermark: string | null; rows: number }> {
  const { facts, company } = await loadListingFactsForScope(supabase, toListingScope(scope), { email: callerEmail });
  const rows = buildListingReadiness(exchange, facts);
  const watermark = watermarkLabel({ recipient });
  const buffer = await renderListingReadinessPdf({ company, exchange, rows, score: scoreReadiness(rows), generatedAt: new Date().toISOString().slice(0, 10), watermark });
  return { buffer, watermark, rows: rows.length };
}

function pdfResponse(out: { buffer: Buffer; watermark: string | null; rows: number }, exchange: Exchange, charged: number): NextResponse {
  const headers: Record<string, string> = {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="listing-readiness-${exchange}.pdf"`,
    "Cache-Control": "private, no-store",
    "X-BlockID-Readiness-Rows": String(out.rows),
    "X-BlockID-Credits-Charged": String(charged),
  };
  if (out.watermark) headers["X-BlockID-Watermark"] = "1";
  return new NextResponse(new Uint8Array(out.buffer), { status: 200, headers });
}

export async function GET(req: NextRequest): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const raw = url.searchParams.get("exchange") ?? "asx";
  if (!isExchange(raw)) return NextResponse.json({ ok: false, error: "exchange must be asx or nasdaq" }, { status: 400 });

  const { scope, denied } = await projectScopeOrDeny("editor");
  if (denied) return denied;
  if (!scope) return NextResponse.json({ ok: false, error: "project_required" }, { status: 404 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const listedCost = FEATURE_COSTS[FEATURE_KEY] ?? 1;
  const [gate, { profile }] = await Promise.all([listingPdfIncluded({ id: user.id, plan: user.plan }), loadListingFactsForScope(supabase, toListingScope(scope), { email: user.email })]);
  if (!gate.included && !(profile.pdfCreditsCharged > 0)) {
    const afford = await canAfford(user.id, FEATURE_KEY);
    return NextResponse.json({ ok: false, error: "payment_required", cost: listedCost, listedCost, balance: afford.balance, creditNote: creditChargeNote(scope) }, { status: 402 });
  }
  const out = await renderForScope(supabase, scope, raw, user.email, url.searchParams.get("for"));
  return pdfResponse(out, raw, 0);
}

async function POST_handler(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const limited = enforceRateLimit("listing-readiness-pdf", user.id, request, RATE_LIMIT_PER_HOUR, 60 * 60 * 1000);
  if (limited) return limited;

  const read = await readJsonBody<Record<string, unknown> | null>(request, BODY_MAX_BYTES);
  if (!read.ok) {
    if (read.status === 413) return read.response;
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const body: Record<string, unknown> = read.body && typeof read.body === "object" ? read.body : {};
  const raw = body.exchange ?? "asx";
  if (!isExchange(raw)) return NextResponse.json({ ok: false, error: "exchange must be asx or nasdaq" }, { status: 400 });
  const exchange: Exchange = raw;
  const confirmed = body.confirm === true;
  const recipient = typeof body.for === "string" ? body.for : null;

  const { scope, denied } = await projectScopeOrDeny("editor");
  if (denied) return denied;
  if (!scope) return NextResponse.json({ ok: false, error: "project_required" }, { status: 404 });
  const creditNote = creditChargeNote(scope);

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const listedCost = FEATURE_COSTS[FEATURE_KEY] ?? 1;
  const [gate, loaded] = await Promise.all([listingPdfIncluded({ id: user.id, plan: user.plan }), loadListingFactsForScope(supabase, toListingScope(scope), { email: user.email })]);
  const alreadyCharged = loaded.profile.pdfCreditsCharged > 0;
  let cost = 0;
  let balance: number | null = null;
  if (!gate.included && !alreadyCharged) {
    const afford = await canAfford(user.id, FEATURE_KEY);
    cost = listedCost;
    balance = afford.balance;
    if (!afford.allowed) {
      return NextResponse.json({ ok: false, error: "insufficient_credits", creditsRequired: cost, balance: afford.balance, reason: afford.reason ?? "insufficient_credits", creditNote }, { status: 402 });
    }
  }
  if (!confirmed) {
    return NextResponse.json({ ok: true, preview: true, exchange, cost, listedCost, included: gate.included, includedVia: gate.via, alreadyCharged, balance, creditNote });
  }

  let creditsCharged = 0;
  if (cost > 0) {
    const spent = await spendCredits(user.id, FEATURE_KEY, { project_id: scope.projectId, exchange });
    if (!spent.ok) return NextResponse.json({ ok: false, error: "credit_spend_failed", creditsRequired: cost, balance: spent.balance, creditNote }, { status: 402 });
    creditsCharged = cost;
  }

  let out: Awaited<ReturnType<typeof renderForScope>>;
  try {
    const rows = buildListingReadiness(exchange, loaded.facts);
    const watermark = watermarkLabel({ recipient });
    const buffer = await renderListingReadinessPdf({ company: loaded.company, exchange, rows, score: scoreReadiness(rows), generatedAt: new Date().toISOString().slice(0, 10), watermark });
    out = { buffer, watermark, rows: rows.length };
  } catch (err) {
    console.error("[listing:pdf] render failed", err);
    if (creditsCharged > 0) {
      const refund = await grantCredits(user.id, creditsCharged, "refund", { feature: FEATURE_KEY, project_id: scope.projectId, reason: "render_failed" });
      if (!refund.ok) console.error("[listing:pdf] refund after render failure did not land", { user: user.id, project: scope.projectId });
    }
    return NextResponse.json({ ok: false, error: "render_failed", retryCost: cost }, { status: 500 });
  }
  if (creditsCharged > 0) {
    const stamped = await markListingPdfCharged(supabase, scope.projectId, creditsCharged);
    if (!stamped) console.error("[listing:pdf] charge stamp did not land — the next export will be charged again", { project: scope.projectId });
  }
  return pdfResponse(out, exchange, creditsCharged);
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/listing/readiness/pdf/route.ts", method: "POST" }, POST_handler);
