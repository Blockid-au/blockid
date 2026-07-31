/**
 * GET /embed/badge?slug={slug}&size={sm|md|lg}
 *
 * Master Upgrade Plan §11.1 embed widget — returns an SVG badge that
 * third-party pages can hotlink via `<img src="…/embed/badge?slug=x" />`
 * or `<object>`. Shows the trust badge with verification level chip
 * and last-verified date.
 *
 * Contract:
 *   200 image/svg+xml — always. On unknown slug or `public_index=false`
 *   we return a generic "Unverified" placeholder SVG (still 200) so
 *   the embed page never displays a broken image icon.
 *
 * Caching:
 *   Cache-Control: public, max-age=300, s-maxage=3600
 *   ETag derived from (verification_level, last_verified_at) — revalidation
 *   via If-None-Match returns 304 with no body.
 *
 * PII: never renders anything beyond what /id/[slug] already exposes
 * (legal name is intentionally NOT included — badges live on third-party
 * pages that may or may not want the name; keep it minimal).
 */

import type { NextRequest } from "next/server";
import { readPublicProfile } from "@/lib/business-id/public-profile";
import {
  badgeChrome,
  type BadgeChrome,
  type ProfileKind,
} from "@/lib/business-id/profile-disclosure";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Size = "sm" | "md" | "lg";

const SIZE_PX: Record<Size, { w: number; h: number; fontLg: number; fontSm: number }> = {
  sm: { w: 160, h: 44, fontLg: 12, fontSm: 9 },
  md: { w: 220, h: 64, fontLg: 16, fontSm: 11 },
  lg: { w: 300, h: 88, fontLg: 22, fontSm: 13 },
};

function parseSize(input: string | null): Size {
  if (input === "sm" || input === "md" || input === "lg") return input;
  return "md";
}

function formatVerifiedDate(iso: string | null): string {
  if (!iso) return "not yet verified";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-AU", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "unknown";
  }
}

interface BadgeInputs {
  level: number;
  verifiedOn: string;
  trustScore: number | null;
  size: Size;
  /** Null when the slug resolved to nothing (unknown / unpublished). */
  kind: ProfileKind | null;
  chrome: BadgeChrome;
}

function renderBadge({
  verifiedOn,
  trustScore,
  size,
  chrome,
}: BadgeInputs): string {
  const { w, h, fontLg, fontSm } = SIZE_PX[size];
  const ink = "#f2fbf9";
  // The score only accompanies a real verification claim. Printing
  // "81.3/100" on a sample badge would read as a measured result.
  const scoreLine =
    chrome.claimsVerified && trustScore !== null ? ` · ${trustScore}/100` : "";

  // Chip width scales with size. "DEMO" needs more room than "L4".
  const baseChipW = size === "lg" ? 44 : size === "md" ? 34 : 26;
  const chipW = chrome.chipText.length > 2 ? baseChipW + 22 : baseChipW;
  const chipH = h - 12;
  const chipFont = chrome.chipText.length > 2 ? fontLg - 4 : fontLg;

  // Second line. For a real verification this is the verified-on date;
  // for anything else it is the disclosure, and the word "Verified"
  // never appears.
  const subline = chrome.claimsVerified
    ? `${chrome.sublinePrefix} ${verifiedOn} · blockid.au`
    : `${chrome.sublinePrefix} · blockid.au`;

  // Escape XML-sensitive chars in dynamic text
  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(chrome.accessibleTitle)}">
  <title>${esc(chrome.accessibleTitle)}</title>
  <rect x="0" y="0" width="${w}" height="${h}" rx="8" ry="8" fill="${chrome.background}" />
  <rect x="6" y="6" width="${chipW}" height="${chipH}" rx="6" ry="6" fill="${chrome.accent}" />
  <text x="${6 + chipW / 2}" y="${6 + chipH / 2 + chipFont / 3}" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="${chipFont}" font-weight="700" fill="${chrome.background}" text-anchor="middle">${esc(chrome.chipText)}</text>
  <text x="${6 + chipW + 10}" y="${h / 2 - 2}" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="${fontLg - 2}" font-weight="600" fill="${ink}">${esc(chrome.headline)}${esc(scoreLine)}</text>
  <text x="${6 + chipW + 10}" y="${h / 2 + fontSm + 4}" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="${fontSm}" fill="${ink}" opacity="0.75">${esc(subline)}</text>
</svg>`;
}

/**
 * Weak ETag derived from the badge inputs. Weak (W/) because the
 * generated SVG contains formatted human dates that could differ
 * across locales while the underlying data is unchanged.
 */
function computeEtag(inputs: BadgeInputs): string {
  // `kind` is part of the seed: flipping a row from 'customer' to 'demo'
  // changes the badge from a verification claim to a disclosure, and a
  // stale CDN copy of the old one is exactly what must not happen.
  const seed = `${inputs.kind ?? "none"}|${inputs.level}|${inputs.trustScore ?? "-"}|${inputs.verifiedOn}|${inputs.size}`;
  // Small, cheap hash — good enough for CDN revalidation.
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return `W/"badge-${h.toString(16)}"`;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const slug = (url.searchParams.get("slug") ?? "").trim();
  const size = parseSize(url.searchParams.get("size"));

  const profile = slug ? await readPublicProfile(slug) : null;

  // `kind === null` covers both "no slug given" and "slug resolved to
  // nothing" — same generic placeholder either way.
  const kind: ProfileKind | null = profile ? profile.profileKind : null;
  const level = profile?.verificationLevel ?? 0;

  const inputs: BadgeInputs = {
    level,
    verifiedOn: profile ? formatVerifiedDate(profile.lastVerifiedAt) : "—",
    trustScore: profile ? profile.trustScore : null,
    size,
    kind,
    chrome: badgeChrome({ kind, level }),
  };

  const etag = computeEtag(inputs);
  const ifNoneMatch = req.headers.get("if-none-match");
  const cacheHeaders: Record<string, string> = {
    "Cache-Control": "public, max-age=300, s-maxage=3600",
    ETag: etag,
    Vary: "Accept-Encoding",
  };

  if (ifNoneMatch && ifNoneMatch === etag) {
    return new Response(null, { status: 304, headers: cacheHeaders });
  }

  const svg = renderBadge(inputs);
  return new Response(svg, {
    status: 200,
    headers: {
      ...cacheHeaders,
      "Content-Type": "image/svg+xml; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
