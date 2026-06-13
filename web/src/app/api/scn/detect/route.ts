// POST /api/scn/detect — SCN context detection.
//
// Founder gives an idea / website / GitHub repo / revenue → we detect their
// stage + growth phase, run a VC-grade valuation, and return the SCN follow-up
// questions + next-best-action. The front door of the SCN model.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { buildScnContext, type ScnInput, type ScnDeps } from "@/lib/scn-detect";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ── Network adapters (kept here so the engine stays pure) ─────────────────

async function fetchUrl(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "BlockID-SCN/1.0 (+https://blockid.au)" },
    signal: AbortSignal.timeout(8000),
    redirect: "follow",
  });
  const html = await res.text();
  // Strip tags/scripts → keep visible text + a few attribute hints, cap size.
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 20000);
}

async function auditRepo(fullName: string): Promise<{ hasSourceCode: boolean; hasProduct: boolean; activity: "active" | "stale" | "unknown"; evidence: string }> {
  const res = await fetch(`https://api.github.com/repos/${fullName}`, {
    headers: { "User-Agent": "BlockID-SCN/1.0", Accept: "application/vnd.github+json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return { hasSourceCode: true, hasProduct: false, activity: "unknown", evidence: `GitHub repo ${fullName} referenced (metadata unavailable).` };
  const r = (await res.json()) as { homepage?: string; pushed_at?: string; stargazers_count?: number; size?: number; has_pages?: boolean };
  const pushedDaysAgo = r.pushed_at ? (Date.now() - new Date(r.pushed_at).getTime()) / 86_400_000 : Infinity;
  const activity: "active" | "stale" | "unknown" = pushedDaysAgo < 90 ? "active" : isFinite(pushedDaysAgo) ? "stale" : "unknown";
  const hasProduct = Boolean(r.homepage) || Boolean(r.has_pages) || (r.size ?? 0) > 500;
  return {
    hasSourceCode: true,
    hasProduct,
    activity,
    evidence: `GitHub ${fullName}: ${r.stargazers_count ?? 0}★, ${activity} (last push ${isFinite(pushedDaysAgo) ? Math.round(pushedDaysAgo) + "d ago" : "unknown"})${r.homepage ? `, live site ${r.homepage}` : ""} → source-code/product signal.`,
  };
}

const deps: ScnDeps = { fetchUrl, auditRepo };

export async function POST(request: Request) {
  const user = await getCurrentUser().catch(() => null);
  const rlKey = `scn-detect:${user?.id ?? request.headers.get("x-forwarded-for") ?? "anon"}`;
  const rl = checkRateLimit(rlKey, 20, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, error: "Rate limited", retryAfter: rl.resetIn }, { status: 429 });
  }

  let body: ScnInput;
  try {
    body = (await request.json()) as ScnInput;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.text && !body.websiteUrl && !body.githubUrl && !body.mrrAud) {
    return NextResponse.json({ ok: false, error: "Provide at least one of: text, websiteUrl, githubUrl, mrrAud" }, { status: 400 });
  }

  try {
    const context = await buildScnContext(body, deps);
    return NextResponse.json({ ok: true, context });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Detection failed" }, { status: 500 });
  }
}
