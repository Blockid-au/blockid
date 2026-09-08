// GET /api/analyses — the caller's own saved runs, newest first.
//
// Two kinds of caller, one endpoint:
//   * signed in  → every analysis on their user_id (including ones claimed
//     from a pre-signup anonymous session);
//   * signed out → the analyses written against their `blockid_anon` cookie
//     and not yet claimed by anybody.
//
// Neither can see the other's. A caller with no session and no cookie gets an
// empty list, not a 401 — "you have nothing saved" is the honest answer for a
// first-time visitor, and a 401 would push the UI into a sign-in prompt for a
// surface that works fine anonymously.
//
// Never returns raw input text: this is a list view.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readAnonKey } from "@/lib/analyses/anon-key";
import { listAnalysesForViewer } from "@/lib/analyses/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let userId: string | null = null;
  try {
    userId = (await getCurrentUser())?.id ?? null;
  } catch {
    userId = null;
  }
  const anonKey = userId ? null : await readAnonKey();
  if (!userId && !anonKey) {
    return NextResponse.json({ ok: true, analyses: [] });
  }
  const analyses = await listAnalysesForViewer({ userId, anonKey });
  return NextResponse.json({ ok: true, analyses });
}
