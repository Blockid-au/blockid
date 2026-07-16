// POST /api/legal/wholesale-verify
//
// Accepts a wholesale-investor certification file (multipart/form-data).
// We do NOT store the raw file bytes on disk from this handler — instead
// we compute a sha256 hash, persist the hash + metadata into
// audit_events + consent_events, and set app_users.wholesale_status to
// 'wholesale_certified'. A human reviewer confirms downstream; the flag
// unlocks wholesale-only UI but explicit legal review still gates any
// equity issuance path via lib/legal/gates.ts.

import { NextResponse } from "next/server";
import { createHash } from "node:crypto";

import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { recordConsent, hashDisclaimerBody } from "@/lib/consent";
import { appendAudit } from "@/lib/audit";
import { DISCLAIMER_VERSIONS } from "@/lib/legal/versions";
import { detectJurisdiction } from "@/lib/jurisdiction";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
]);

function readClientMeta(request: Request): { ip: string; ua: string } {
  const fwd = request.headers.get("x-forwarded-for") || "";
  const ip = fwd.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "";
  const ua = request.headers.get("user-agent") || "";
  return { ip, ua };
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, reason: "Authentication required" },
      { status: 401 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { ok: false, reason: "Expected multipart/form-data" },
      { status: 400 },
    );
  }

  const fileEntry = form.get("file");
  if (!(fileEntry instanceof File)) {
    return NextResponse.json(
      { ok: false, reason: "Missing 'file' field" },
      { status: 400 },
    );
  }
  if (fileEntry.size === 0) {
    return NextResponse.json(
      { ok: false, reason: "Empty file" },
      { status: 400 },
    );
  }
  if (fileEntry.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      {
        ok: false,
        reason: `File too large. Max is ${MAX_UPLOAD_BYTES} bytes`,
      },
      { status: 413 },
    );
  }
  const contentType = (fileEntry.type || "").toLowerCase();
  if (contentType && !ALLOWED_TYPES.has(contentType)) {
    return NextResponse.json(
      {
        ok: false,
        reason: `Unsupported content type '${contentType}'`,
      },
      { status: 415 },
    );
  }

  // Compute sha256 of the file bytes. We only persist the hash — the raw
  // file is intentionally discarded from this handler; a follow-up
  // reviewer flow can store the bytes to a bucket with restricted RLS.
  const bytes = new Uint8Array(await fileEntry.arrayBuffer());
  const fileHash = createHash("sha256").update(bytes).digest("hex");

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { ok: false, reason: "Supabase unavailable" },
      { status: 503 },
    );
  }

  // ---- Jurisdiction / meta ----
  let jurisdiction = "AU";
  try {
    const j = await detectJurisdiction(request);
    if (j?.country) jurisdiction = j.country;
  } catch {
    /* fall through */
  }
  const { ip, ua } = readClientMeta(request);

  // ---- 1. Record consent (kind = wholesale_certification) ----
  let consentId: string;
  try {
    const consent = await recordConsent({
      user_id: user.id,
      kind: "wholesale_certification",
      disclaimer_version: DISCLAIMER_VERSIONS.wholesale_certification,
      // Hash the canonical version-tagged token so counsel can prove which
      // disclaimer copy the user acknowledged at cert-upload time.
      disclaimer_hash: hashDisclaimerBody(
        `wholesale_certification:${DISCLAIMER_VERSIONS.wholesale_certification}`,
      ),
      ip,
      ua,
      jurisdiction,
      granted: true,
      detail: {
        file_hash: fileHash,
        file_size: fileEntry.size,
        content_type: contentType || "application/octet-stream",
        filename: fileEntry.name || "cert",
      },
    });
    consentId = consent.id;
  } catch (err) {
    console.error(
      "[wholesale-verify] recordConsent failed",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { ok: false, reason: "Consent persistence failed" },
      { status: 500 },
    );
  }

  // ---- 2. Update app_users.wholesale_status ----
  const { error: updateErr } = await admin
    .from("app_users")
    .update({ wholesale_status: "wholesale_certified" })
    .eq("id", user.id);
  if (updateErr) {
    console.error(
      "[wholesale-verify] app_users update failed",
      updateErr.message,
    );
    return NextResponse.json(
      { ok: false, reason: "Failed to update account status" },
      { status: 500 },
    );
  }

  // ---- 3. Append hash-chained audit event ----
  try {
    await appendAudit({
      user_id: user.id,
      actor: "user",
      action: "wholesale_certification_submitted",
      resource_type: "app_users",
      resource_id: user.id,
      detail: {
        file_hash: fileHash,
        file_size: fileEntry.size,
        content_type: contentType || "application/octet-stream",
        filename: fileEntry.name || "cert",
        consent_event_id: consentId,
        jurisdiction,
      },
    });
  } catch (err) {
    console.warn(
      "[wholesale-verify] appendAudit failed (non-fatal)",
      err instanceof Error ? err.message : err,
    );
  }

  return NextResponse.json({
    ok: true,
    wholesale_certified: true,
    consent_id: consentId,
    file_hash: fileHash,
  });
}
