import { NextResponse } from "next/server";
import {
  hydrateFounderPackBySlug,
  logFounderPackView,
} from "@/lib/idea-phase/persist";
import { renderFounderPackPdf } from "@/lib/pdf/founder-pack-pdf";
import { hashIp, clientIpFromHeaders } from "@/lib/iphash";

// GET /s/p/[slug]/pdf — streams an application/pdf rendering of the Founder
// Pack. Mirrors /s/[slug]/pdf for the wedge Score artifact.
//
// We log a view here as well as on the share page so a "download PDF" hit
// from a copied URL still counts. The pack share page also logs on render.

export const dynamic = "force-dynamic";

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const pack = await hydrateFounderPackBySlug(slug);
  if (!pack) {
    return NextResponse.json(
      { ok: false, error: "Not found" },
      { status: 404 },
    );
  }

  const ipHash = hashIp(clientIpFromHeaders(request.headers));
  const ua = request.headers.get("user-agent");
  const referer = request.headers.get("referer");
  void logFounderPackView({
    packId: pack.id,
    ipHash,
    userAgent: ua,
    referer,
  });

  const shareUrl = `${siteUrl()}/s/p/${slug}`;
  const buffer = await renderFounderPackPdf({ pack, shareUrl });
  const filename = `blockid-founder-pack-${slug}.pdf`;
  const body = new Uint8Array(buffer);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "Content-Length": String(buffer.length),
    },
  });
}
