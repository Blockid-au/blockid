// Per-profile OG card for /listings/[slug].
//
// Real data per page — company name, index value, stage, sector and the
// valuation range — rather than one shared template with a swapped name. A
// slug that is not published renders the neutral directory card instead of
// leaking that the id exists.
//
// Satori (next/og) renders outside the DOM: it has no CSS custom properties
// and no Tailwind, so the palette here is written as literal hex. These
// values mirror the light-first rev.4 tokens (surface / ink / accent) and are
// the one place in this feature where a raw colour is unavoidable.

import { ImageResponse } from "next/og";
import { getPublishedBySlug } from "@/lib/publish/store";
import { buildPublicProfile, formatAud } from "@/lib/publish/profile";

export const runtime = "nodejs";
export const alt = "Startup Value Index profile — BlockID.au";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const SURFACE = "#ffffff";
const SUNKEN = "#f1f5f9";
const INK = "#0f172a";
const INK_MUTED = "#475569";
const INK_FAINT = "#94a3b8";
const ACCENT = "#2563eb";

export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let row = null;
  try {
    row = await getPublishedBySlug(decodeURIComponent(slug).toLowerCase());
  } catch {
    row = null;
  }

  if (!row || !row.svi) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: 80,
            background: SURFACE,
          }}
        >
          <div style={{ fontSize: 30, color: ACCENT, fontWeight: 600 }}>
            BlockID.au
          </div>
          <div style={{ fontSize: 62, color: INK, fontWeight: 700, marginTop: 16 }}>
            Australian startup directory
          </div>
          <div style={{ fontSize: 30, color: INK_MUTED, marginTop: 20 }}>
            Scored, valued and published by their founders
          </div>
        </div>
      ),
      { ...size },
    );
  }

  const profile = buildPublicProfile({
    slug: row.slug,
    companyName: row.company_name,
    oneLiner: row.one_liner,
    sector: row.sector,
    websiteUrl: row.website_url,
    svi: row.svi,
    analysedAt: row.analysed_at,
    publishedAt: row.first_published_at,
    updatedAt: row.updated_at,
  });

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: 72,
          background: SURFACE,
        }}
      >
        <div style={{ display: "flex", fontSize: 26, color: INK_FAINT, letterSpacing: 2 }}>
          {profile.sectorLabel.toUpperCase()} · {profile.stageLabel.toUpperCase()} · AUSTRALIA
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 68,
            color: INK,
            fontWeight: 700,
            marginTop: 18,
            lineHeight: 1.1,
          }}
        >
          {profile.companyName.slice(0, 42)}
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 28,
            color: INK_MUTED,
            marginTop: 20,
            lineHeight: 1.35,
          }}
        >
          {profile.oneLiner.slice(0, 130)}
        </div>

        <div style={{ display: "flex", gap: 20, marginTop: "auto" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              background: SUNKEN,
              borderRadius: 20,
              padding: "22px 30px",
            }}
          >
            <span style={{ fontSize: 20, color: INK_FAINT, letterSpacing: 1.5 }}>
              STARTUP VALUE INDEX
            </span>
            <span style={{ fontSize: 58, color: INK, fontWeight: 700 }}>
              {profile.sviTotal}
            </span>
          </div>
          {profile.valuation && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                background: SUNKEN,
                borderRadius: 20,
                padding: "22px 30px",
              }}
            >
              <span style={{ fontSize: 20, color: INK_FAINT, letterSpacing: 1.5 }}>
                INDICATIVE VALUATION
              </span>
              <span style={{ fontSize: 46, color: INK, fontWeight: 700 }}>
                {formatAud(profile.valuation.low)} – {formatAud(profile.valuation.high)}
              </span>
            </div>
          )}
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              marginLeft: "auto",
              fontSize: 28,
              color: ACCENT,
              fontWeight: 600,
            }}
          >
            blockid.au
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
