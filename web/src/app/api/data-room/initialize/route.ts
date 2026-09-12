import "server-only";
import { NextResponse } from "next/server";
import { gateRequireFeature } from "@/lib/feature-gate";
import { apiRoute } from "@/lib/audit/api-route";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// RETIRED 2026-09-08 — /api/data-room/generate is the single data-room writer.
//
// This route was the third of three unreconciled data-room implementations
// (feature-gates.manifest.ts flagged the reconciliation as an open CTO call).
// It had two fatal problems and zero callers anywhere in src/:
//
//   1. It wrote `account_id, email, token, title, is_active` to `data_rooms`.
//      None of those columns exist — the real shape is user_id / project_id /
//      name / sections / access_token / is_public / …  — so every call 500'd on
//      the insert, exactly like POST /api/investor-data-room did.
//   2. Where it did work it seeded ~34 checklist rows and handed back a
//      `shareUrl` built from a token column that does not exist. That seeding
//      pattern is what produced the demo room investors would have opened: 34
//      documents marked complete with no file and no content behind any of
//      them.
//
// Rather than repair a second writer that would immediately contend with
// generate's `data_rooms_user_project_uidx` unique index, it is retired. The
// real path is:
//
//   POST /api/data-room/generate      — assemble the room + write real content
//   POST /api/data-room/auto-fill     — LLM-expand one template document
//   POST /api/investor-data-room      — mint the investor share link
//   GET  /s/dr/[token]                — what the investor actually opens
//
// The gate call is kept so feature-gates.manifest.ts stays truthful while the
// route still exists as a signpost.
// ---------------------------------------------------------------------------

const GONE = {
  ok: false,
  error: "retired",
  message:
    "Data room initialisation is now part of POST /api/data-room/generate, which writes real document content instead of an empty checklist.",
  use: "/api/data-room/generate",
} as const;

async function POST_handler() {
  const gate = await gateRequireFeature("data_room.access");
  if (!gate.ok) return gate.response;
  return NextResponse.json(GONE, { status: 410 });
}

export async function GET() {
  const gate = await gateRequireFeature("data_room.access");
  if (!gate.ok) return gate.response;
  return NextResponse.json(GONE, { status: 410 });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/data-room/initialize/route.ts", method: "POST" }, POST_handler);
