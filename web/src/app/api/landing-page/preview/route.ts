// POST /api/landing-page/preview
//
// Guide gap closed: docs/plans/atlassian-standard-mapping-goal.md §1 phase 4
// P1 gap ("landing-page one-click publisher — Chapter 4 CTA references it but
// no `/api/landing-page/publish` route"), spun off as P4a-publish-route (the
// preview-render half of the P4a-landing-page-preview pure lib ship). Sibling
// P4a-publish-storage will add the durable persistence + subdomain routing
// leg; this route is deliberately stateless so a founder (or the CMO agent)
// can render a draft without a Supabase gate or a project row.
//
// Behaviour:
//   * Body: LandingPageInput JSON per web/src/lib/landing-page/preview.ts.
//   * 200 body: {markdown, html, validation:{valid, reasons[]}}. Validation
//     is ALWAYS surfaced alongside the render so a founder sees the gap list
//     even for a partial preview (the pure renderer emits placeholders for
//     missing fields — the validation array is the machine-readable pair).
//   * 400 on invalid JSON or non-object body — otherwise every input is
//     rendered because the pure lib is defensive on empty fields.
//
// Boundary: no AFSL / APP hedge because there is no financial or personal
// data output — the rendered HTML deliberately carries no BlockID branding
// or tracking (see the module-level comment in preview.ts) so a founder can
// publish it on their own domain without leaking our GA4 property.

import { NextResponse } from "next/server";
import {
  renderLandingPageHtml,
  renderLandingPageMarkdown,
  validateLandingPageInput,
  type LandingPageInput,
} from "@/lib/landing-page/preview";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

export async function POST(request: Request): Promise<Response> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json", message: "request body must be JSON" },
      { status: 400 },
    );
  }

  if (!isPlainObject(parsed)) {
    return NextResponse.json(
      { error: "invalid_body", message: "request body must be a JSON object" },
      { status: 400 },
    );
  }

  const input = coerceInput(parsed);
  const validation = validateLandingPageInput(input);
  const markdown = renderLandingPageMarkdown(input);
  const html = renderLandingPageHtml(input);

  return NextResponse.json(
    { markdown, html, validation },
    {
      status: 200,
      // Pure per-request render; never cache — the founder's input is the
      // key and there is no server-side state to invalidate.
      headers: { "cache-control": "no-store" },
    },
  );
}
