// GET /api/listing/readiness?exchange=asx|nasdaq — the listing readiness
// checklist for the caller's active project (S29-A).
//
//   viewer+ on the project; no project → empty rows with `role: null`.
//   Rows come from the pure checker (`lib/listing/readiness.ts`) over the
//   facts `lib/listing/server.ts` assembles for the OWNER's data (cap
//   table × share price, bank-line profit, grant profile, listing profile).
//   Also returns the founder-ticked facts, the PDF price and whether the
//   export is included / already paid, so the page shows the cost before
//   anyone presses "Export".
//
// GET only — nothing mutates.

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { projectScopeOrDeny } from "@/lib/project-members/http";
import { FEATURE_COSTS } from "@/lib/credits";
import { listingPdfIncluded } from "@/lib/listing/gate";
import { loadListingFactsForScope } from "@/lib/listing/server";
import { buildListingReadiness, computeFreeFloat, computeSpread, isExchange, scoreReadiness, type Exchange } from "@/lib/listing/readiness";

export const dynamic = "force-dynamic";

export const PDF_FEATURE_KEY = "listing_readiness_pdf";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const raw = new URL(request.url).searchParams.get("exchange") ?? "asx";
  if (!isExchange(raw)) return NextResponse.json({ ok: false, error: "exchange must be asx or nasdaq" }, { status: 400 });
  const exchange: Exchange = raw;

  const { scope, denied } = await projectScopeOrDeny("viewer");
  if (denied) return denied;
  const listedCost = FEATURE_COSTS[PDF_FEATURE_KEY] ?? 1;
  if (!scope) return NextResponse.json({ ok: true, exchange, role: null, rows: [], score: scoreReadiness([]), facts: {}, inputs: null, pdf: { listedCost, cost: listedCost, included: false, includedVia: null, alreadyCharged: false } });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const [{ facts, company, profile }, gate] = await Promise.all([
    loadListingFactsForScope(supabase, { projectId: scope.projectId, ownerUserId: scope.ownerUserId, dataEmail: scope.dataEmail, project: { name: scope.project.name, stage: scope.project.stage ?? null, industry: scope.project.industry ?? null } }, { email: user.email }),
    listingPdfIncluded({ id: user.id, plan: user.plan }),
  ]);
  const rows = buildListingReadiness(exchange, facts);
  const restricted = facts.profile.restricted_holder_ids ?? [];
  const alreadyCharged = profile.pdfCreditsCharged > 0;
  return NextResponse.json({
    ok: true,
    exchange,
    role: scope.role,
    company,
    rows,
    score: scoreReadiness(rows),
    facts: facts.profile,
    factsUpdatedAt: profile.updatedAt,
    inputs: {
      holders: facts.holders.length,
      sharePriceAud: facts.sharePriceAud,
      profitLast12mAud: facts.profitLast12mAud,
      profitCoverageMonths: facts.profitCoverageMonths,
      incorporatedAt: facts.incorporatedAt,
      spread: computeSpread(facts.holders, facts.profile.proposed_issue_price_aud ?? facts.sharePriceAud, restricted),
      freeFloat: computeFreeFloat(facts.holders, restricted),
      shareholders: facts.holders.map((h) => ({ id: h.id, name: h.name, role: h.role, sharesHeld: h.sharesHeld, restricted: h.id !== null && restricted.includes(h.id) })),
    },
    pdf: { listedCost, cost: gate.included || alreadyCharged ? 0 : listedCost, included: gate.included, includedVia: gate.via, alreadyCharged },
  });
}
