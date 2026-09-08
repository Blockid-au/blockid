// GET /api/analyses/[id] — one saved run.
//
// Authorised as the owning user, OR the holder of the anon cookie the run was
// written against. Everyone else gets 404, not 403: a 403 confirms that the
// id exists, which is exactly the fact we are withholding. "Not found" and
// "not yours" are deliberately indistinguishable from the outside.
//
// Nothing here is public. A saved analysis is private by default (migration
// 0124, following the consent precedent of 0122) and there is no share flag
// this route will honour until a founder explicitly opts in.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readAnonKey } from "@/lib/analyses/anon-key";
import { getAnalysisForViewer } from "@/lib/analyses/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // A malformed id cannot match a row; answer it the same way as a real miss
  // so the endpoint gives away nothing about which ids are shaped correctly.
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  let userId: string | null = null;
  try {
    userId = (await getCurrentUser())?.id ?? null;
  } catch {
    userId = null;
  }
  const anonKey = await readAnonKey();

  const analysis = await getAnalysisForViewer(id, { userId, anonKey });
  if (!analysis) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, analysis });
}
