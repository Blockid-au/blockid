// POST /api/pricing-test/event
// Body: { experiment, variantKey, type: "impression"|"conversion",
//         sessionId, userId?, valueAud? }
//
// Public write endpoint. Returns 202 Accepted eagerly — the DB insert is
// best-effort so a slow Supabase never blocks a conversion click.

import { NextResponse } from "next/server";
import { getExperimentByName, recordEvent } from "@/lib/pricing-experiments";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface EventBody {
  experiment?: unknown;
  variantKey?: unknown;
  type?: unknown;
  sessionId?: unknown;
  userId?: unknown;
  valueAud?: unknown;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as EventBody | null;
  if (!body) return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });

  const experimentName = typeof body.experiment === "string" ? body.experiment.trim() : "";
  const variantKey = typeof body.variantKey === "string" ? body.variantKey.trim() : "";
  const type = body.type === "impression" || body.type === "conversion" ? body.type : null;
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";

  if (!experimentName || !variantKey || !type || !sessionId) {
    return NextResponse.json(
      { ok: false, error: "experiment, variantKey, type, sessionId required" },
      { status: 400 },
    );
  }

  const userId = typeof body.userId === "string" && body.userId ? body.userId : undefined;
  const valueAud =
    typeof body.valueAud === "number" && Number.isFinite(body.valueAud) ? body.valueAud : undefined;

  const experiment = await getExperimentByName(experimentName);
  if (!experiment) {
    // 202 even on unknown experiment to keep the write path uniform for the
    // caller — the operator can inspect the admin page to see nothing landed.
    return NextResponse.json({ ok: true, recorded: false }, { status: 202 });
  }

  void recordEvent(experiment.id, variantKey, type, { sessionId, userId, valueAud });
  return NextResponse.json({ ok: true, recorded: true }, { status: 202 });
}
