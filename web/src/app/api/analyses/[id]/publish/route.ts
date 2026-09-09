// /api/analyses/[id]/publish — the founder's control over one analysis.
//
//   GET     what is public right now (and what was published, so the form
//           reopens with their own words rather than a blank slate)
//   POST    publish, or update an already-published profile
//   DELETE  unpublish — takes effect on the next request, no cache to wait out
//
// Owner-only and signed-in-only, and every unauthorised case answers 404 like
// the sibling GET /api/analyses/[id]: a 403 would confirm the id exists, and
// analysis ids are the handle on a founder's private work.
//
// Publishing requires a real account rather than the anonymous cookie the
// run may have been created under. Making a company profile public and
// indexable is durable and consequential; a cookie that a browser can clear
// is not a strong enough claim on a company's name to hang one on.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getPublishState,
  publishAnalysis,
  unpublishAnalysis,
} from "@/lib/publish/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function notFound() {
  return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
}

async function resolve(
  params: Promise<{ id: string }>,
): Promise<{ id: string; userId: string } | null> {
  const { id } = await params;
  if (!id || !UUID_RE.test(id)) return null;
  let userId: string | null = null;
  try {
    userId = (await getCurrentUser())?.id ?? null;
  } catch {
    userId = null;
  }
  if (!userId) return null;
  return { id, userId };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const who = await resolve(params);
  if (!who) return notFound();
  const state = await getPublishState(who.id, who.userId);
  if (!state) return notFound();
  return NextResponse.json({ ok: true, state });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const who = await resolve(params);
  if (!who) return notFound();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, reasons: ["Could not read the form."] },
      { status: 400 },
    );
  }

  // Consent is never inferred. The client must say so explicitly, in the same
  // request that carries the fields, after it has rendered the preview.
  if (body.confirm !== true) {
    return NextResponse.json(
      { ok: false, reasons: ["Confirm that you want this profile made public."] },
      { status: 400 },
    );
  }

  const result = await publishAnalysis({
    analysisId: who.id,
    userId: who.userId,
    input: {
      companyName: body.companyName,
      oneLiner: body.oneLiner,
      sector: body.sector,
      websiteUrl: body.websiteUrl,
    },
  });

  if (!result.ok) {
    if (result.status === 404) return notFound();
    return NextResponse.json(
      { ok: false, reasons: result.reasons },
      { status: result.status },
    );
  }
  return NextResponse.json({ ok: true, slug: result.slug, url: result.url });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const who = await resolve(params);
  if (!who) return notFound();
  const result = await unpublishAnalysis({
    analysisId: who.id,
    userId: who.userId,
  });
  if (!result.ok) {
    if (result.status === 404) return notFound();
    return NextResponse.json(
      { ok: false, error: "Could not unpublish. Try again." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, published: false });
}
