// POST /api/landing-page/publish
//
// Guide gap closed: docs/plans/atlassian-standard-mapping-goal.md §1 phase 4
// P1 gap ("landing-page one-click publisher — Chapter 4 CTA references it but
// no `/api/landing-page/publish` route"), spun off as P4a-publish-route (the
// auth-gated persistence half of the P4a-publish-snapshot pure lib ship —
// see web/src/lib/landing-page/publish-snapshot.ts).
//
// Behaviour:
//   * Body: { input: LandingPageInput, slug: string, dry_run?: boolean,
//     hostname?: string, published_at?: string (ISO) }.
//   * Auth: requires a logged-in caller (getCurrentUser). Landing-page
//     publishing is a Chapter-4 free feature so there is no entitlement gate.
//   * Runs `buildPublishSnapshot(input, {slug, publishedAt, hostname})`. On
//     refusal, propagates the reasons list as 400. On publish, seeds one
//     `dataroom_files` row into folder 4 "Product & Technology" (svi_dimension
//     = "product") keyed on the content_sha256 fingerprint so a re-publish of
//     the same HTML is a no-op (returns `persisted: false, existing: true`).
//   * `dry_run: true` short-circuits persistence — the founder gets the
//     snapshot metadata + rendered HTML for preview without a data-room side
//     effect.
//
// Idempotency contract:
//   * The natural key is (user_id, file_name) where file_name embeds the
//     first 12 hex chars of content_sha256, e.g.
//     `landing-page-<canonical_slug>-<sha12>.html`.
//   * A second POST with identical content → 200 with `persisted: false,
//     existing: true, existing_id`.
//   * A POST with the same slug but different content → 200 with a fresh row
//     (different sha12 → different file_name), so the caller keeps a history
//     of published snapshots without clobbering the earlier one.
//
// Storage boundary: this route does NOT push the HTML to a public host. The
// subdomain routing at `<slug>.landing.blockid.au` is P4a-publish-storage
// (still deferred). The `canonical_url` in the response is aspirational —
// clients should treat it as the target hostname once storage is wired.
//
// Boundary: no AFSL / financial-product output → no AFSL disclaimer. The
// `disclaimer` field carries the APP 1 / APP 5 hosting-responsibility hedge
// from the pure lib (PUBLISH_SNAPSHOT_DISCLAIMER).

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  buildPublishSnapshot,
  type PublishSnapshot,
} from "@/lib/landing-page/publish-snapshot";
import type { LandingPageInput } from "@/lib/landing-page/preview";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SVI_DIMENSION = "product" as const;
const MIME_TYPE = "text/html" as const;
const SHA_SUFFIX_LENGTH = 12 as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function coerceInput(raw: Record<string, unknown>): LandingPageInput {
  const bulletsRaw = raw.bullets;
  const bullets = Array.isArray(bulletsRaw)
    ? bulletsRaw.map((b) => (typeof b === "string" ? b : ""))
    : [];
  return {
    headline: typeof raw.headline === "string" ? raw.headline : "",
    subheadline: typeof raw.subheadline === "string" ? raw.subheadline : "",
    bullets,
    cta_label: typeof raw.cta_label === "string" ? raw.cta_label : "",
    cta_href: typeof raw.cta_href === "string" ? raw.cta_href : "",
    ga4_measurement_id:
      typeof raw.ga4_measurement_id === "string" ? raw.ga4_measurement_id : undefined,
    plausible_domain:
      typeof raw.plausible_domain === "string" ? raw.plausible_domain : undefined,
    brand_name: typeof raw.brand_name === "string" ? raw.brand_name : undefined,
  };
}

function buildFileName(snapshot: PublishSnapshot): string {
  const sha = snapshot.content_sha256.slice(0, SHA_SUFFIX_LENGTH);
  return `landing-page-${snapshot.canonical_slug}-${sha}.html`;
}

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Authentication required" },
      { status: 401 },
    );
  }

  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json", message: "request body must be JSON" },
      { status: 400 },
    );
  }
  if (!isPlainObject(parsed)) {
    return NextResponse.json(
      { ok: false, error: "invalid_body", message: "request body must be a JSON object" },
      { status: 400 },
    );
  }

  const slug = typeof parsed.slug === "string" ? parsed.slug : "";
  const dryRun = parsed.dry_run === true;
  const hostname = typeof parsed.hostname === "string" ? parsed.hostname : undefined;
  const publishedAtRaw =
    typeof parsed.published_at === "string" ? parsed.published_at : undefined;
  const publishedAt = publishedAtRaw ? new Date(publishedAtRaw) : undefined;

  const inputRaw = isPlainObject(parsed.input) ? parsed.input : {};
  const input = coerceInput(inputRaw);

  const result = buildPublishSnapshot(input, {
    slug,
    publishedAt,
    hostname,
  });

  if (result.status === "refused") {
    return NextResponse.json(
      {
        ok: false,
        error: "publish_refused",
        reasons: result.reasons,
        validation: result.validation,
      },
      { status: 400 },
    );
  }

  const { snapshot } = result;
  const fileName = buildFileName(snapshot);

  if (dryRun) {
    return NextResponse.json(
      {
        ok: true,
        persisted: false,
        dry_run: true,
        snapshot,
        file_name: fileName,
      },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "supabase_unavailable" },
      { status: 503 },
    );
  }

  // Idempotency check: (user_id, file_name) is the natural key. The
  // file_name embeds the content_sha256 prefix so a re-publish of the same
  // HTML is a no-op.
  const existing = await supabase
    .from("dataroom_files")
    .select("id, drive_file_url")
    .eq("user_id", user.id)
    .eq("file_name", fileName)
    .maybeSingle();

  if (existing.error && existing.error.code !== "PGRST116") {
    return NextResponse.json(
      { ok: false, error: "existing_lookup_failed", detail: existing.error.message },
      { status: 500 },
    );
  }

  if (existing.data) {
    return NextResponse.json(
      {
        ok: true,
        persisted: false,
        existing: true,
        existing_id: existing.data.id,
        snapshot,
        file_name: fileName,
      },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  }

  const insert = await supabase
    .from("dataroom_files")
    .insert({
      user_id: user.id,
      email: user.email,
      svi_dimension: SVI_DIMENSION,
      file_name: fileName,
      drive_file_url: snapshot.canonical_url,
      file_size_bytes: snapshot.size_bytes,
      mime_type: MIME_TYPE,
      status: "present",
      template_slug: "landing-page-publish",
      template_version: "v1",
    })
    .select("id")
    .single();

  if (insert.error) {
    return NextResponse.json(
      { ok: false, error: "insert_failed", detail: insert.error.message },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      persisted: true,
      existing: false,
      dataroom_file_id: insert.data.id,
      snapshot,
      file_name: fileName,
    },
    { status: 201, headers: { "cache-control": "no-store" } },
  );
}
