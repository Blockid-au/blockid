// /api/investor-data-room — founder-side control plane for investor share links.
//
// WHAT CHANGED (2026-09-08). The previous implementation inserted
// `account_id, email, token, title, is_active, view_count, expires_at` into
// `data_rooms`. None of those columns exist on that table, so every single
// "Share with investor" click returned 500 — the feature had never worked once.
// The GET-by-token path filtered on the same phantom columns.
//
// The share record now lives in `data_room_access_tokens`, which already had
// exactly the shape this needs: a unique `token`, `expires_at`, `is_active`,
// `access_count`, `first_accessed` / `last_accessed`, and per-investor identity
// (name / email / firm). `data_rooms.access_token` is a single scalar — one
// link for every investor, and revoking it kills every share at once — so it is
// deliberately not used as the credential. `data_rooms.is_public` is not
// consulted anywhere: consent is the existence of a link the founder minted,
// nothing else. (Migration 0125 cleared the one stale is_public=true row.)
//
//   POST   → mint a share link for the caller's data room
//   GET    → list the caller's share links with view counts
//   GET ?token=… → 307 to the public page (kept so old JSON links still land
//                  somewhere useful; it redirects blind, so it is not an oracle)
//   DELETE ?token=… → revoke a link the caller owns
//
// The investor-facing read is /s/dr/[token] — a rendered page, not JSON.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  mintShareToken,
  resolveExpiry,
  shareLinkState,
  type ShareLinkRow,
} from "@/lib/data-room";
import { apiRoute } from "@/lib/audit/api-route";

export const dynamic = "force-dynamic";

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}

export function shareUrl(token: string): string {
  return `${siteUrl()}/s/dr/${token}`;
}

interface ShareBody {
  dataRoomId?: string;
  investorName?: string;
  investorEmail?: string;
  investorFirm?: string;
  expiresInDays?: number | null;
  /** S21-A — require the NDA on this link even when the room does not. */
  ndaRequired?: boolean;
}

function trim(v: unknown, max = 200): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

// ---------------------------------------------------------------------------
// POST — mint a share link
// ---------------------------------------------------------------------------

async function POST_handler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Authentication required" },
      { status: 401 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Database not configured" },
      { status: 503 },
    );
  }

  let body: ShareBody = {};
  try {
    body = (await request.json()) as ShareBody;
  } catch {
    // No body is fine — every field is optional.
  }

  // ── Resolve the room. Tenancy is enforced by user_id on the select, so a
  //    caller cannot mint a link against somebody else's room by guessing an
  //    id. ────────────────────────────────────────────────────────────────
  let query = supabase
    .from("data_rooms")
    .select("id, name, startup_name, completeness_score")
    .eq("user_id", user.id);
  if (body.dataRoomId) query = query.eq("id", body.dataRoomId);
  const { data: room } = await query
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!room) {
    return NextResponse.json(
      {
        ok: false,
        error: "no_data_room",
        message:
          "Generate your data room first — there is nothing to share yet.",
      },
      { status: 409 },
    );
  }

  const token = mintShareToken();
  const expiresAt = resolveExpiry(body.expiresInDays);

  // S21-A — the recipient line burned into PDFs served through this link
  // (mirror of share_packages.watermark, 0251): name, else firm, else email.
  const investorName = trim(body.investorName);
  const investorEmail = trim(body.investorEmail);
  const investorFirm = trim(body.investorFirm);
  const watermark = investorName ?? investorFirm ?? investorEmail;

  const { data: link, error: insertErr } = await supabase
    .from("data_room_access_tokens")
    .insert({
      data_room_id: room.id,
      account_id: user.id,
      token,
      investor_name: investorName,
      investor_email: investorEmail,
      investor_firm: investorFirm,
      access_level: "view",
      is_active: true,
      expires_at: expiresAt,
      nda_required: body.ndaRequired === true,
      watermark,
    })
    .select("id, created_at")
    .maybeSingle();

  if (insertErr) {
    console.error("[blockid:investor-data-room] share insert failed", insertErr);
    return NextResponse.json(
      { ok: false, error: "Failed to create share link" },
      { status: 500 },
    );
  }

  // Best-effort denormalised counter for the founder dashboard. Never fail the
  // share on it — the link already exists at this point.
  try {
    const { data: active } = await supabase
      .from("data_room_access_tokens")
      .select("id")
      .eq("data_room_id", room.id)
      .eq("is_active", true);
    await supabase
      .from("data_rooms")
      .update({ investor_count: (active ?? []).length })
      .eq("id", room.id);
  } catch (err) {
    console.error("[blockid:investor-data-room] investor_count bump failed", err);
  }

  return NextResponse.json({
    ok: true,
    token,
    url: shareUrl(token),
    dataRoomId: room.id,
    shareId: link?.id ?? null,
    expiresAt,
    createdAt: link?.created_at ?? null,
  });
}

// ---------------------------------------------------------------------------
// GET — founder's link list, or a blind redirect for a legacy ?token= link
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const token = new URL(request.url).searchParams.get("token");

  // Legacy share URLs pointed straight at this JSON endpoint. Redirect them to
  // the rendered page. This runs before any DB read and before auth, so it
  // reveals nothing about whether the token exists — /s/dr/[token] 404s on a
  // bad one exactly like it would here.
  if (token) {
    return NextResponse.redirect(shareUrl(token), 307);
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Authentication required" },
      { status: 401 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Database not configured" },
      { status: 503 },
    );
  }

  const { data: links } = await supabase
    .from("data_room_access_tokens")
    .select(
      "id, token, data_room_id, investor_name, investor_email, investor_firm, access_count, first_accessed, last_accessed, expires_at, is_active, revoked_at, created_at, nda_required, nda_signed_at, nda_signed_version, watermark",
    )
    .eq("account_id", user.id)
    .order("created_at", { ascending: false });

  const rows = (links ?? []) as Array<ShareLinkRow & Record<string, unknown>>;

  return NextResponse.json({
    ok: true,
    links: rows.map((l) => ({
      id: l.id,
      dataRoomId: l.data_room_id,
      url: shareUrl(l.token as string),
      investorName: l.investor_name ?? null,
      investorEmail: l.investor_email ?? null,
      investorFirm: l.investor_firm ?? null,
      state: shareLinkState(l),
      views: Number(l.access_count ?? 0),
      firstAccessed: l.first_accessed ?? null,
      lastAccessed: l.last_accessed ?? null,
      expiresAt: l.expires_at ?? null,
      createdAt: l.created_at ?? null,
      // S21-A — NDA state per link; the founder's activity shows it.
      ndaRequired: Boolean(l.nda_required),
      ndaSignedAt: (l.nda_signed_at as string | null) ?? null,
      ndaSignedVersion:
        typeof l.nda_signed_version === "number" ? l.nda_signed_version : null,
      watermark: (l.watermark as string | null) ?? null,
    })),
  });
}

// ---------------------------------------------------------------------------
// DELETE ?token=… — revoke
// ---------------------------------------------------------------------------

async function DELETE_handler(request: NextRequest) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "token query parameter is required" },
      { status: 400 },
    );
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Authentication required" },
      { status: 401 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Database not configured" },
      { status: 503 },
    );
  }

  // Scoped by account_id: revoking somebody else's link and revoking a token
  // that does not exist are indistinguishable to the caller.
  const { data: updated, error } = await supabase
    .from("data_room_access_tokens")
    .update({ is_active: false, revoked_at: new Date().toISOString() })
    .eq("token", token)
    .eq("account_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[blockid:investor-data-room] revoke failed", error);
    return NextResponse.json(
      { ok: false, error: "Failed to revoke share link" },
      { status: 500 },
    );
  }

  if (!updated) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, revoked: true });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/investor-data-room/route.ts", method: "POST" }, POST_handler);
export const DELETE = apiRoute({ route: "api/investor-data-room/route.ts", method: "DELETE" }, DELETE_handler);
