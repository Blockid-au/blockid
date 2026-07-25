// POST /api/startup-package/reservation
//
// DB-first cap-table reservation (Ship 1). Founder picks pct_reserved
// (min 10, max 100, default 20) + a 3-4 letter ticker_hint. We validate,
// upsert the row via `upsertReservedAllocation`, mirror the ticker into
// `projects.package_ticker`, and return the row.
//
// On-chain issuance is intentionally NOT wired in Ship 1 — the UI shows a
// disabled "Issue on-chain" button with tooltip; the actual call to
// `/api/blockchain/create-token` is deferred to Ship 2.
//
// SUBGOAL 8 (spawn-agent-v-d-ng-cosmic-aho plan).

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit/persistent";
import { getProjectById } from "@/lib/projects";
import { upsertReservedAllocation } from "@/lib/startup-package/reservation-server";

export const dynamic = "force-dynamic";

const RATE_LIMIT_PER_HOUR = 30;

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const rl = await consumeRateLimit({
    bucket: "startup_package.reservation",
    actorId: user.id,
    limit: RATE_LIMIT_PER_HOUR,
    windowSeconds: 3600,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: "rate_limited",
        retry_after_seconds: rl.retry_after_seconds ?? 60,
      },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retry_after_seconds ?? 60) },
      },
    );
  }

  let body:
    | {
        projectId?: string;
        pct_reserved?: number;
        ticker_hint?: string;
      }
    | null = null;
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const projectId = String(body?.projectId ?? "").trim();
  if (!projectId) {
    return NextResponse.json(
      { ok: false, error: "projectId is required" },
      { status: 400 },
    );
  }

  const project = await getProjectById(projectId);
  if (!project || project.userId !== user.id) {
    return NextResponse.json(
      { ok: false, error: "project_not_found_or_forbidden" },
      { status: 403 },
    );
  }

  const pct = Number(body?.pct_reserved ?? 20);
  const ticker = String(body?.ticker_hint ?? "").trim().toUpperCase();

  const result = await upsertReservedAllocation({
    projectId,
    pct_reserved: pct,
    ticker_hint: ticker,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, field: result.field },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    reservation: result.row,
    onChainDeferred: true,
    onChainMessage:
      "On-chain issuance coming in Ship 2 — reserved allocation stored in your dataroom for now.",
  });
}
