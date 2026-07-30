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
  levelLabel: string;
  verifiedOn: string;
  trustScore: number | null;
  size: Size;
  verified: boolean;
}

const LEVEL_LABELS: Record<number, string> = {
  0: "Unverified",
  1: "Self-declared",
  2: "Evidence-checked",
  3: "Trust tier",
  4: "Attested",
  5: "Continuously monitored",
};

function renderBadge({
  level,
  levelLabel,
  verifiedOn,
  trustScore,
  size,
  verified,
}: BadgeInputs): string {
  const { w, h, fontLg, fontSm } = SIZE_PX[size];
  const bg = verified ? "#0a1622" : "#3a3a3a";
  const accent = verified ? "#4fd1c5" : "#999999";
  const ink = "#f2fbf9";
  const chipText = verified ? `L${level}` : "N/A";
  const scoreLine =
    verified && trustScore !== null ? ` · ${trustScore}/100` : "";

  // Chip width scales with size
  const chipW = size === "lg" ? 44 : size === "md" ? 34 : 26;
  const chipH = h - 12;

  const title = verified
    ? `BlockID Verified — Level ${level} ${levelLabel}`
    : "BlockID — Unverified";

  // Escape XML-sensitive chars in dynamic text
  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(title)}">
  <title>${esc(title)}</title>
  <rect x="0" y="0" width="${w}" height="${h}" rx="8" ry="8" fill="${bg}" />
  <rect x="6" y="6" width="${chipW}" height="${chipH}" rx="6" ry="6" fill="${accent}" />
  <text x="${6 + chipW / 2}" y="${6 + chipH / 2 + fontLg / 3}" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="${fontLg}" font-weight="700" fill="${bg}" text-anchor="middle">${esc(chipText)}</text>
  <text x="${6 + chipW + 10}" y="${h / 2 - 2}" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="${fontLg - 2}" font-weight="600" fill="${ink}">${esc(levelLabel)}${esc(scoreLine)}</text>
  <text x="${6 + chipW + 10}" y="${h / 2 + fontSm + 4}" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="${fontSm}" fill="${ink}" opacity="0.75">Verified ${esc(verifiedOn)} · blockid.au</text>
</svg>`;
}

/**
 * Weak ETag derived from the badge inputs. Weak (W/) because the
 * generated SVG contains formatted human dates that could differ
 * across locales while the underlying data is unchanged.
 */
function computeEtag(inputs: BadgeInputs): string {
  const seed = `${inputs.verified ? "v" : "u"}|${inputs.level}|${inputs.trustScore ?? "-"}|${inputs.verifiedOn}|${inputs.size}`;
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

  let inputs: BadgeInputs;

  if (!slug) {
    inputs = {
      level: 0,
      levelLabel: "Unverified",
      verifiedOn: "—",
      trustScore: null,
      size,
      verified: false,
    };
  } else {
    const profile = await readPublicProfile(slug);
    if (!profile) {
      inputs = {
        level: 0,
        levelLabel: "Unverified",
        verifiedOn: "—",
        trustScore: null,
        size,
        verified: false,
      };
    } else {
      inputs = {
        level: profile.verificationLevel,
        levelLabel: LEVEL_LABELS[profile.verificationLevel] ?? "Unverified",
        verifiedOn: formatVerifiedDate(profile.lastVerifiedAt),
        trustScore: profile.trustScore,
        size,
        verified: true,
      };
    }
  }

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
