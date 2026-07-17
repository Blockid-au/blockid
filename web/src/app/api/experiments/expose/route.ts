// POST /api/experiments/expose (T-0413).
//
// The client calls this once per experiment surface to receive its
// deterministic variant. Server assigns + persists (if user known) so
// the same user never sees two variants across sessions.

import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { assign, getExperiment } from "@/lib/conversion/experiments";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({
  experiment_id: z.string().min(1).max(64),
  session_id: z.string().max(128).nullish(),
});

export async function POST(req: Request) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 400 });
  }

  const exp = getExperiment(body.experiment_id);
  if (!exp) {
    return NextResponse.json({ ok: false, error: "unknown_experiment" }, { status: 404 });
  }

  const user = await getCurrentUser();
  const variant = await assign({
    experimentId: exp.id,
    userId: user?.id ?? null,
    sessionId: body.session_id ?? null,
  });

  return NextResponse.json({
    ok: true,
    experiment_id: exp.id,
    variant: variant ?? exp.default_variant,
    active: exp.active,
  });
}
