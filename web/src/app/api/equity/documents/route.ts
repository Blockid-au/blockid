// POST /api/equity/documents — generate an AU-compliant document from
// in-memory equity data. Returns markdown. No DB write here (workspace
// dashboard is the source of truth until the user persists a plan).

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  esopGrantLetter,
  vestingAgreement,
  foundersAgreement,
  capTableSummary,
  type DocumentKind,
} from "@/lib/equity/au-templates";

export const dynamic = "force-dynamic";

interface MemberPayload {
  name: string;
  email?: string | null;
  role: string;
  shares_issued?: number;
  options_granted?: number;
  join_date: string;
  vesting?: {
    total_shares: number;
    cliff_months: number;
    vest_months: number;
    schedule_type: string;
    start_date: string;
    accelerate_on_exit?: boolean;
  };
}

interface Body {
  kind: DocumentKind;
  plan: {
    startup_name: string;
    total_shares: number;
    pre_money_valuation?: number | null;
    incorporation_date?: string | null;
    jurisdiction?: string;
  };
  members: MemberPayload[];
  cap?: Array<{
    name: string;
    role: string;
    shareClass: string;
    shares: number;
    options: number;
    ownershipPct: number;
    fullyDilutedPct: number;
    valueAud: number;
  }>;
  esopPct?: number;
  exercisePriceAud?: number;
  targetMemberName?: string;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Auth required" }, { status: 401 });

  let body: Body;
  try { body = (await request.json()) as Body; }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }

  if (!body.kind || !body.plan) {
    return NextResponse.json({ ok: false, error: "kind and plan required" }, { status: 400 });
  }

  const startupCtx = {
    startupName: body.plan.startup_name || "[Startup]",
    incorporationDate: body.plan.incorporation_date ?? null,
    jurisdiction: body.plan.jurisdiction ?? "AU",
    totalShares: body.plan.total_shares,
    preMoneyValuationAud: body.plan.pre_money_valuation ?? null,
  };

  const pickMember = (): MemberPayload | null => {
    if (body.targetMemberName) {
      return body.members.find((m) => m.name === body.targetMemberName) ?? null;
    }
    return body.members[0] ?? null;
  };

  const toMemberCtx = (m: MemberPayload) => ({
    name: m.name,
    email: m.email ?? null,
    role: m.role,
    sharesIssued: m.shares_issued ?? 0,
    optionsGranted: m.options_granted ?? 0,
    joinDate: m.join_date,
  });

  const toVestingCtx = (m: MemberPayload) => ({
    totalShares: m.vesting?.total_shares ?? m.options_granted ?? m.shares_issued ?? 0,
    cliffMonths: m.vesting?.cliff_months ?? 12,
    vestMonths: m.vesting?.vest_months ?? 48,
    scheduleType: m.vesting?.schedule_type ?? "monthly",
    startDate: m.vesting?.start_date ?? m.join_date,
    accelerateOnExit: m.vesting?.accelerate_on_exit ?? false,
  });

  switch (body.kind) {
    case "esop_grant": {
      const m = pickMember();
      if (!m) return NextResponse.json({ ok: false, error: "No member to grant to" }, { status: 400 });
      return NextResponse.json({
        ok: true,
        markdown: esopGrantLetter(
          startupCtx,
          toMemberCtx(m),
          toVestingCtx(m),
          body.exercisePriceAud ?? 0.01,
        ),
      });
    }
    case "vesting_agreement": {
      const m = pickMember();
      if (!m) return NextResponse.json({ ok: false, error: "No member" }, { status: 400 });
      return NextResponse.json({
        ok: true,
        markdown: vestingAgreement(startupCtx, toMemberCtx(m), toVestingCtx(m)),
      });
    }
    case "founders_agreement": {
      const founders = body.members.filter((m) => m.role === "founder" || m.role === "cofounder");
      const subjects = (founders.length > 0 ? founders : body.members).map(toMemberCtx);
      return NextResponse.json({
        ok: true,
        markdown: foundersAgreement(startupCtx, subjects),
      });
    }
    case "cap_table_summary": {
      const rows = (body.cap ?? body.members.map((m) => ({
        name: m.name,
        role: m.role,
        shareClass: "Ordinary",
        shares: m.shares_issued ?? 0,
        options: m.options_granted ?? 0,
        ownershipPct: 0,
        fullyDilutedPct: 0,
        valueAud: 0,
      })));
      return NextResponse.json({
        ok: true,
        markdown: capTableSummary(startupCtx, {
          rows,
          totalShares: body.plan.total_shares,
          esopPoolPct: body.esopPct,
          preMoneyValuationAud: body.plan.pre_money_valuation ?? null,
        }),
      });
    }
    default:
      return NextResponse.json({ ok: false, error: `Unknown kind: ${body.kind}` }, { status: 400 });
  }
}
