// POST /api/data-room/nda — an investor accepts the room's NDA (S21-A).
//
// Unauthenticated on purpose: the share token in the body is the credential,
// exactly as /s/dr/[token] treats it. Every failure that would confirm or
// deny a token's existence collapses to 404, same as the page.
//
// What it records, per (link, nda_version):
//   data_room_nda_acceptances { viewer_email?, ip_hash, ua_family,
//                               nda_text_sha256, accepted_at }
//   data_room_access_tokens   { nda_signed_at, nda_signed_ip (hash),
//                               nda_signed_version }
//   data_room_engagement      { event_type: 'nda_sign' }
//
// Version handling: the body carries the version the investor was shown.
// If the founder bumped the clause between render and click, the stored
// acceptance would be for text the investor never saw — so a stale version
// is refused with 409 and the page reloads to show the new clause.
//
// r-03-exempt: investor-facing click-wrap; entitlement is the room owner's
// plan (checked via ownerTrustEntitled), not the anonymous caller's.

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { apiRoute, auditNote } from "@/lib/audit/api-route";
import { uaFamily } from "@/lib/audit/redact";
import { shareLinkState, type ShareLinkRow } from "@/lib/data-room";
import { ndaGate, normaliseNdaVersion, parseNdaAcceptBody } from "@/lib/dataroom/nda";
import { ndaTextHash, ownerTrustEntitled } from "@/lib/dataroom/nda-server";
import { clientIpFromHeaders, hashIp } from "@/lib/iphash";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const NOT_FOUND = () => NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

async function POST_handler(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }

  const parsed = parseNdaAcceptBody(await req.json().catch(() => null));
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  const { data: link } = await supabase
    .from("data_room_access_tokens")
    .select(
      "id, data_room_id, account_id, is_active, revoked_at, expires_at, nda_required, nda_signed_at, nda_signed_version",
    )
    .eq("token", parsed.token)
    .maybeSingle();
  if (!link || !link.data_room_id) return NOT_FOUND();
  if (shareLinkState(link as ShareLinkRow) !== "active") return NOT_FOUND();

  const { data: room } = await supabase
    .from("data_rooms")
    .select("id, user_id, nda_required, nda_text, nda_version")
    .eq("id", link.data_room_id)
    .maybeSingle();
  if (!room) return NOT_FOUND();

  const entitled = await ownerTrustEntitled(String(room.user_id ?? link.account_id ?? ""));
  const gate = ndaGate(
    {
      ndaRequired: Boolean(room.nda_required),
      ndaText: (room.nda_text as string | null) ?? null,
      ndaVersion: normaliseNdaVersion(room.nda_version),
    },
    {
      ndaRequired: Boolean(link.nda_required),
      ndaSignedAt: (link.nda_signed_at as string | null) ?? null,
      ndaSignedVersion: typeof link.nda_signed_version === "number" ? link.nda_signed_version : null,
    },
    entitled,
  );

  if (gate.status === "not_required") {
    return NextResponse.json({ ok: true, status: "not_required" });
  }
  if (gate.status === "accepted") {
    return NextResponse.json({ ok: true, status: "accepted", version: gate.version });
  }
  if (parsed.version !== gate.version) {
    return NextResponse.json(
      { ok: false, error: "nda_version_changed", version: gate.version },
      { status: 409 },
    );
  }

  const ipHash = hashIp(clientIpFromHeaders(req.headers));
  const ua = uaFamily(req.headers.get("user-agent"));
  const now = new Date().toISOString();

  // The unique (access_token_id, nda_version) index makes a double-click a
  // no-op. `upsert … ignoreDuplicates` is PostgREST's ON CONFLICT DO NOTHING.
  const { error: insertErr } = await supabase.from("data_room_nda_acceptances").upsert(
    {
      data_room_id: room.id,
      access_token_id: link.id,
      account_id: link.account_id ?? room.user_id,
      nda_version: gate.version,
      nda_text_sha256: ndaTextHash(gate.text),
      viewer_email: parsed.email,
      ip_hash: ipHash,
      ua_family: ua,
      accepted_at: now,
    },
    { onConflict: "access_token_id,nda_version", ignoreDuplicates: true },
  );
  if (insertErr) {
    console.error("[blockid:data-room/nda] acceptance insert failed", insertErr);
    return NextResponse.json({ ok: false, error: "Could not record acceptance" }, { status: 500 });
  }

  const { error: updateErr } = await supabase
    .from("data_room_access_tokens")
    .update({
      nda_signed_at: now,
      nda_signed_ip: ipHash,
      nda_signed_version: gate.version,
      ...(parsed.email ? { investor_email: parsed.email } : {}),
    })
    .eq("id", link.id);
  if (updateErr) {
    console.error("[blockid:data-room/nda] token update failed", updateErr);
    return NextResponse.json({ ok: false, error: "Could not record acceptance" }, { status: 500 });
  }

  // Telemetry: the founder's activity log shows the signature next to views.
  try {
    await supabase.from("data_room_engagement").insert({
      data_room_id: room.id,
      access_token_id: link.id,
      event_type: "nda_sign",
      section: null,
      document_name: null,
      ip_hash: ipHash,
      user_agent: ua,
    });
  } catch (err) {
    console.error("[blockid:data-room/nda] engagement insert failed", err);
  }

  auditNote(String(link.id), { nda_version: gate.version });
  return NextResponse.json({ ok: true, status: "accepted", version: gate.version, acceptedAt: now });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/data-room/nda/route.ts", method: "POST" }, POST_handler);
