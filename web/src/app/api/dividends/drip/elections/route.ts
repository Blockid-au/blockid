/**
 * /api/dividends/drip/elections — dividend reinvestment plan elections (S28-A).
 *
 * GET (viewer+)
 *   Every election of the active project (active first) joined to the
 *   cap-table shareholder, the allocations made so far (with the
 *   share-issue resolution link), the cap-table shareholders that can elect,
 *   the current S26-B share price (mid) and a PREVIEW of the next
 *   allocation: for the newest dividend record that still has payouts
 *   without a live statement, each active election's estimated shares /
 *   reinvested amount / cash at the price it would use. Nothing is written.
 *
 * POST `{ shareholderId, participationPct, priceBasis?, manualPriceAud? }` (editor+)
 *   Records an election for a cap-table shareholder of the OWNER's project
 *   (an existing active election for the shareholder is revoked first — one
 *   active row per shareholder). `participationPct` 0–100;
 *   `priceBasis` 'share_price_mid' (default) | 'manual' (needs
 *   `manualPriceAud` > 0). No credit cost.
 *   201 { ok, election, replaced }   400 validation   404 shareholder_not_found
 *
 * DELETE `{ id }` (editor+)
 *   Revokes an election (sets `revoked_at`; rows are never deleted — an
 *   allocation made under it still references it).
 *   200 { ok, election }   404 not_found   409 already_revoked
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { projectScopeOrDeny } from "@/lib/project-members/http";
import { isUuid, readJsonBody } from "@/lib/security/request-guards";
import { apiRoute } from "@/lib/audit/api-route";
import { DRIP_PRICE_BASES, clampParticipation, computeDripAllocation, electionPrice, usablePrice, type DripPriceBasis } from "@/lib/dividends/drip";
import { allocationSummary, electionSummary, listAllocationsForProject, listElectionsForProject, revokeElection, upsertElection } from "@/lib/dividends/drip-server";
import { listDividendRecordsForScope, listStatementsForProject, loadCompanyForScope, loadShareholdersForScope, matchPayouts, toStatementRecord } from "@/lib/dividends/server";
import { buildDividendStatement } from "@/lib/dividends/statement";
import { loadSharePriceMidForScope } from "@/lib/share-price-server";

export const dynamic = "force-dynamic";

const BODY_MAX_BYTES = 4 * 1024;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { scope, denied } = await projectScopeOrDeny("viewer");
  if (denied) return denied;
  if (!scope) return NextResponse.json({ ok: true, role: null, elections: [], allocations: [], shareholders: [], marketPriceAud: null, preview: null });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const recordScope = { projectId: scope.projectId, ownerUserId: scope.ownerUserId, projectName: scope.project.name };
  const [elections, allocations, shareholders, records, statements] = await Promise.all([
    listElectionsForProject(supabase, scope.projectId),
    listAllocationsForProject(supabase, scope.projectId),
    loadShareholdersForScope(supabase, recordScope),
    listDividendRecordsForScope(supabase, recordScope, 20),
    listStatementsForProject(supabase, scope.projectId),
  ]);
  const holderById = new Map(shareholders.filter((s) => s.id).map((s) => [s.id as string, s]));
  const active = elections.filter((e) => !e.revokedAt);
  const needsMarket = active.some((e) => e.priceBasis === "share_price_mid");
  const marketPriceAud = needsMarket ? await loadSharePriceMidForScope(supabase, scope, { email: user.email }) : null;

  // Preview: the newest record with at least one payout still to issue.
  let preview: null | { recordId: string; period: string; totalDividendAud: number; rows: Array<Record<string, unknown>> } = null;
  if (active.length > 0) {
    const liveKeys = new Set(statements.filter((s) => !s.voided_at).map((s) => `${s.dividend_record_id}|${s.shareholder_key}`));
    const company = await loadCompanyForScope(supabase, recordScope);
    for (const rec of records) {
      const matches = matchPayouts(rec.payouts ?? [], shareholders).filter((m) => !liveKeys.has(`${rec.id}|${m.key}`));
      if (matches.length === 0) continue;
      const statementRecord = toStatementRecord(rec);
      const rows = matches
        .filter((m) => m.shareholder.id && active.some((e) => e.shareholderId === m.shareholder.id))
        .map((m) => {
          const election = active.find((e) => e.shareholderId === m.shareholder.id)!;
          const net = buildDividendStatement({ company, record: statementRecord, payout: m.payout, shareholder: m.shareholder }).amounts.netPaidAud;
          const price = electionPrice(election, marketPriceAud);
          const a = computeDripAllocation({ netCashAud: net, participationPct: election.participationPct, priceAud: price });
          return { electionId: election.id, shareholderName: m.shareholder.name, participationPct: election.participationPct, priceBasis: election.priceBasis, priceAud: a.priceAud, netCashAud: net, estShares: a.shares, estReinvestedAud: a.reinvestedAud, estResidualAud: a.residualAud, estCashPaidAud: a.cashPaidAud, skipReason: a.ok ? null : a.reason };
        });
      preview = { recordId: rec.id, period: rec.period, totalDividendAud: Number(rec.total_dividend) || 0, rows };
      break;
    }
  }

  return NextResponse.json(
    {
      ok: true,
      role: scope.role,
      elections: elections.map((e) => electionSummary(e, holderById.get(e.shareholderId) ?? null)),
      allocations: allocations.map((a) => allocationSummary(a, a.shareholder_id ? (holderById.get(a.shareholder_id)?.name ?? null) : null)),
      shareholders: shareholders.filter((s) => s.id).map((s) => ({ id: s.id, name: s.name, role: s.role, sharesHeld: s.sharesHeld, electing: active.some((e) => e.shareholderId === s.id) })),
      marketPriceAud,
      preview,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

async function POST_handler(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const read = await readJsonBody<Record<string, unknown> | null>(request, BODY_MAX_BYTES);
  if (!read.ok) {
    if (read.status === 413) return read.response;
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const body: Record<string, unknown> = read.body && typeof read.body === "object" ? read.body : {};
  const shareholderId = typeof body.shareholderId === "string" ? body.shareholderId : "";
  if (!isUuid(shareholderId)) return NextResponse.json({ ok: false, error: "shareholderId_required" }, { status: 400 });
  const pctRaw = body.participationPct;
  const pctNum = typeof pctRaw === "number" ? pctRaw : typeof pctRaw === "string" ? Number(pctRaw) : Number.NaN;
  if (!Number.isFinite(pctNum) || pctNum < 0 || pctNum > 100) return NextResponse.json({ ok: false, error: "participationPct_out_of_range", message: "participationPct must be between 0 and 100." }, { status: 400 });
  const participationPct = clampParticipation(pctNum);
  const priceBasis = (typeof body.priceBasis === "string" ? body.priceBasis : "share_price_mid") as DripPriceBasis;
  if (!DRIP_PRICE_BASES.includes(priceBasis)) return NextResponse.json({ ok: false, error: "priceBasis_invalid" }, { status: 400 });
  const manualPriceAud = priceBasis === "manual" ? usablePrice(body.manualPriceAud) : null;
  if (priceBasis === "manual" && manualPriceAud === null) return NextResponse.json({ ok: false, error: "manualPriceAud_required", message: "A manual price basis needs a price per share above zero." }, { status: 400 });

  const { scope, denied } = await projectScopeOrDeny("editor");
  if (denied) return denied;
  if (!scope) return NextResponse.json({ ok: false, error: "project_required" }, { status: 404 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const recordScope = { projectId: scope.projectId, ownerUserId: scope.ownerUserId, projectName: scope.project.name };
  const shareholders = await loadShareholdersForScope(supabase, recordScope);
  const holder = shareholders.find((s) => s.id === shareholderId) ?? null;
  if (!holder) return NextResponse.json({ ok: false, error: "shareholder_not_found" }, { status: 404 });

  const res = await upsertElection(supabase, { projectId: scope.projectId, userId: user.id, shareholderId, participationPct, priceBasis, manualPriceAud });
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 500 });
  return NextResponse.json({ ok: true, replaced: res.replaced, election: electionSummary(res.election, holder) }, { status: 201 });
}

async function DELETE_handler(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const read = await readJsonBody<Record<string, unknown> | null>(request, BODY_MAX_BYTES);
  if (!read.ok) {
    if (read.status === 413) return read.response;
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const body: Record<string, unknown> = read.body && typeof read.body === "object" ? read.body : {};
  const id = typeof body.id === "string" ? body.id : new URL(request.url).searchParams.get("id") ?? "";
  if (!isUuid(id)) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const { scope, denied } = await projectScopeOrDeny("editor");
  if (denied) return denied;
  if (!scope) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const res = await revokeElection(supabase, id, scope.projectId);
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.error === "not_found" ? 404 : res.error === "already_revoked" ? 409 : 500 });
  const recordScope = { projectId: scope.projectId, ownerUserId: scope.ownerUserId, projectName: scope.project.name };
  const holder = (await loadShareholdersForScope(supabase, recordScope)).find((s) => s.id === res.election.shareholderId) ?? null;
  return NextResponse.json({ ok: true, election: electionSummary(res.election, holder) });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/dividends/drip/elections/route.ts", method: "POST" }, POST_handler);
export const DELETE = apiRoute({ route: "api/dividends/drip/elections/route.ts", method: "DELETE" }, DELETE_handler);
