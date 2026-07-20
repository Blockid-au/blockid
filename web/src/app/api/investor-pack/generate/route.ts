// POST /api/investor-pack/generate
//
// Auth-gated. Assembles the investor pack payload from the founder's
// current workspace state, renders it via @react-pdf/renderer, and streams
// the PDF back with a filename derived from the project slug + today's date.
//
// Credit cost: `investor_pack` (5 credits). Deducted after the render
// succeeds so a failed render doesn't burn credits.
//
// Body (all optional):
//   { raiseAmountAud?: number; useOfFunds?: string }
//
// Mirrors the shape of /api/svi/pdf — synchronous render, application/pdf
// response, no async job queue.

import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getCurrentUser } from "@/lib/auth";
import { getProjectIdFromRequest } from "@/lib/projects";
import { assemblePackData } from "@/lib/investor-pack-assembler";
import { InvestorPackPDF } from "@/components/pdf/investor-pack-pdf";
import { canAfford, spendCredits } from "@/lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FEATURE = "investor_pack";

function sanitizeFilenamePart(input: string): string {
  return (
    input
      .replace(/[^\w\s-]+/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60)
      .toLowerCase() || "startup"
  );
}

function todayCompact(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

interface BodyShape {
  raiseAmountAud?: unknown;
  useOfFunds?: unknown;
}

function parseOverrides(body: BodyShape): {
  raiseAmountAud?: number;
  useOfFunds?: string;
} {
  const overrides: { raiseAmountAud?: number; useOfFunds?: string } = {};
  if (typeof body.raiseAmountAud === "number" && Number.isFinite(body.raiseAmountAud)) {
    overrides.raiseAmountAud = Math.max(0, Math.round(body.raiseAmountAud));
  } else if (typeof body.raiseAmountAud === "string") {
    const parsed = Number(body.raiseAmountAud.replace(/[^\d.]/g, ""));
    if (Number.isFinite(parsed) && parsed > 0) {
      overrides.raiseAmountAud = Math.round(parsed);
    }
  }
  if (typeof body.useOfFunds === "string" && body.useOfFunds.trim().length > 0) {
    overrides.useOfFunds = body.useOfFunds.trim().slice(0, 1000);
  }
  return overrides;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    // Pre-flight credit check — surface 402 before we do any render work.
    const afford = await canAfford(user.id, FEATURE);
    if (!afford.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: "Insufficient credits",
          balance: afford.balance,
          cost: afford.cost,
        },
        { status: 402 },
      );
    }

    let body: BodyShape = {};
    try {
      body = (await request.json()) as BodyShape;
    } catch {
      /* empty body is fine — overrides all optional */
    }
    const overrides = parseOverrides(body);

    const projectId = await getProjectIdFromRequest();
    const data = await assemblePackData(user.id, projectId, overrides);

    const buffer = await renderToBuffer(InvestorPackPDF({ data }));

    // Spend AFTER a successful render — a broken template shouldn't burn
    // the founder's credit. Log the failure and continue so the founder
    // still gets the PDF they paid the auth cost for.
    const spend = await spendCredits(user.id, FEATURE, {
      projectId: projectId ?? null,
      hasCapTable: data.capTable.length > 0,
      hasTeam: data.team.length > 0,
      raiseAmountAud: data.ask.raiseAmountAud,
    });
    if (!spend.ok) {
      console.warn(
        `[investor-pack:generate] credit deduction failed for user ${user.id} — PDF still delivered`,
      );
    }

    const filename = `investor-pack-${sanitizeFilenamePart(data.project.name)}-${todayCompact()}.pdf`;
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "X-Investor-Pack-Generator": "v1",
      },
    });
  } catch (err) {
    console.error("[investor-pack:generate]", err);
    return NextResponse.json(
      { ok: false, error: "PDF generation failed" },
      { status: 500 },
    );
  }
}
