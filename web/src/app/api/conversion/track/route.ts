// POST /api/conversion/track (T-0413).
//
// Records upgrade-CTA impressions + user actions so CDO funnels can
// measure lift per experiment / trigger. Always returns 202 so client
// UX is never blocked on the write.

import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import {
  TRIGGERS,
  type ConversionAction,
  type ConversionTrigger,
  recordConversionEvent,
} from "@/lib/conversion/triggers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TRIGGER_IDS = Object.keys(TRIGGERS) as [ConversionTrigger, ...ConversionTrigger[]];
const ACTIONS = ["shown", "accepted", "dismissed", "snoozed"] as const satisfies readonly ConversionAction[];

const Body = z.object({
  trigger: z.enum(TRIGGER_IDS),
  action: z.enum(ACTIONS),
  plan_from: z.string().max(64).nullish(),
  plan_to: z.string().max(64).nullish(),
  session_id: z.string().max(128).nullish(),
  detail: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: Request) {
  let payload: z.infer<typeof Body>;
  try {
    payload = Body.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 400 });
  }

  const user = await getCurrentUser();
  await recordConversionEvent({
    userId: user?.id ?? null,
    trigger: payload.trigger,
    action: payload.action,
    planFrom: payload.plan_from ?? null,
    planTo: payload.plan_to ?? null,
    sessionId: payload.session_id ?? null,
    detail: payload.detail,
  });

  return NextResponse.json({ ok: true }, { status: 202 });
}
