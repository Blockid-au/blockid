// POST /api/legal/ack
//
// Records a legally-binding consent event (ToS, privacy, general-advice
// warning, wholesale certification, marketing opt-in, etc.) for the
// currently signed-in user.
//
// Body: { kind: string, disclaimer_version?: string, granted?: boolean, detail?: object }
// - If `disclaimer_version` is omitted, the current pinned version from
//   DISCLAIMER_VERSIONS is used.
// - `granted` defaults to `true` (POST implies grant; a revoke should use
//   the future DELETE endpoint).
//
// Returns: { ok, consent_id } on success or { ok: false, reason } on
// validation/persistence failure. Always fail-closed — never silently
// swallow a Supabase error, since the row is the legal artefact.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  recordConsent,
  hashDisclaimerBody,
} from "@/lib/consent";
import {
  DISCLAIMER_VERSIONS,
  getCurrentVersion,
  isKnownDisclaimerKind,
} from "@/lib/legal/versions";
import { detectJurisdiction } from "@/lib/jurisdiction";

export const dynamic = "force-dynamic";

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

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, reason: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const {
    kind,
    disclaimer_version,
    granted,
    detail,
  } = (body as {
    kind?: string;
    disclaimer_version?: string;
    granted?: boolean;
    detail?: Record<string, unknown>;
  }) ?? {};

  if (!kind || typeof kind !== "string") {
    return NextResponse.json(
      { ok: false, reason: "kind is required" },
      { status: 400 },
    );
  }

  if (!isKnownDisclaimerKind(kind)) {
    return NextResponse.json(
      { ok: false, reason: `Unknown disclaimer kind: ${kind}` },
      { status: 400 },
    );
  }

  const version =
    typeof disclaimer_version === "string" && disclaimer_version.length > 0
      ? disclaimer_version
      : getCurrentVersion(kind);

  // Guard against ack of a stale version — force fresh consent when
  // the pinned version has moved past the caller's copy.
  const current = DISCLAIMER_VERSIONS[kind as keyof typeof DISCLAIMER_VERSIONS];
  if (version !== current) {
    return NextResponse.json(
      {
        ok: false,
        reason: `Stale disclaimer version. Expected ${current}, got ${version}`,
      },
      { status: 409 },
    );
  }

  // Best-effort hash of the disclaimer body. We do not have the MDX body
  // in-hand at ack time from the client (the client only sends a version
  // string), so we hash a canonical "kind:version" token as a placeholder.
  // The disclaimer_registry table stores the authoritative body_md hash;
  // this column captures what the CLIENT could prove it saw. When the
  // client sends `detail.body_md` we hash that instead so counsel can
  // reconstruct the exact bytes shown.
  const canonicalBody =
    typeof detail?.body_md === "string"
      ? (detail.body_md as string)
      : `${kind}:${version}`;
  const disclaimer_hash = hashDisclaimerBody(canonicalBody);

  const { ip, ua } = readClientMeta(request);
  let jurisdiction = "AU";
  try {
    const j = await detectJurisdiction(request);
    if (j?.country) jurisdiction = j.country;
  } catch {
    // fall through to default
  }

  try {
    const { id } = await recordConsent({
      user_id: user.id,
      kind,
      disclaimer_version: version,
      disclaimer_hash,
      ip,
      ua,
      jurisdiction,
      granted: granted !== false,
      detail: detail ?? {},
    });
    return NextResponse.json({ ok: true, consent_id: id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[blockid:legal-ack] recordConsent failed", msg);
    return NextResponse.json(
      { ok: false, reason: "Consent persistence failed" },
      { status: 500 },
    );
  }
}
