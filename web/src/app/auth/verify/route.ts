import { NextResponse } from "next/server";
import {
  consumeMagicLink,
  createSessionRow,
  setSessionCookie,
  type PendingPayload,
} from "@/lib/auth";
import {
  persistIdeaEvaluation,
  persistEquitySplit,
  persistFundingPlan,
  mintFounderPack,
} from "@/lib/idea-phase/persist";
import { hashIp, clientIpFromHeaders } from "@/lib/iphash";
import type { IdeaValuationInput } from "@/lib/idea-valuation";
import type { FounderInput, EquitySettings } from "@/lib/equity-split";
import type { FundingPlanInput } from "@/lib/funding-plan";

// GET /auth/verify?token=xxx
//
// The magic-link click target. Does the heavy lifting in one request:
//   1. Consume the magic-link token (single-use, ≤15 min).
//   2. Hydrate any pendingPayload (idea-eval / equity-split / funding-plan
//      submitted at "Save Founder Pack" time) into typed rows under the
//      now-authenticated user.
//   3. If intent=save_founder_pack, mint a founder_packs row + slug.
//   4. Create a 90-day session, set the HttpOnly cookie, 302 redirect to
//      the new pack (or /dashboard for plain logins).
//
// Failure modes 302 to /auth/error?reason=... so the user sees a friendly
// page rather than a JSON blob.

export const dynamic = "force-dynamic";

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}

function errorRedirect(reason: string): NextResponse {
  return NextResponse.redirect(
    `${siteUrl()}/auth/error?reason=${encodeURIComponent(reason)}`,
    { status: 303 },
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token || token.length < 8 || token.length > 64) {
    return errorRedirect("invalid_token");
  }

  const consumed = await consumeMagicLink(token);
  if (!consumed.ok || !consumed.user) {
    return errorRedirect(consumed.reason ?? "unknown");
  }

  const user = consumed.user;
  const payload: PendingPayload = consumed.pendingPayload ?? {};

  // Hydrate pending state, if any. We persist independently — a partial
  // pack is fine.
  let evaluationId: string | undefined;
  let splitId: string | undefined;
  let fundingId: string | undefined;
  let ideaName: string | null = null;

  if (payload.ideaEval?.inputs) {
    const r = await persistIdeaEvaluation({
      userId: user.id,
      inputs: payload.ideaEval.inputs as IdeaValuationInput,
      ideaName: payload.ideaEval.ideaName ?? null,
    });
    if (r.ok) {
      evaluationId = r.id;
      ideaName = payload.ideaEval.ideaName ?? null;
    }
  }
  if (payload.equitySplit?.founders && payload.equitySplit?.settings) {
    const r = await persistEquitySplit({
      userId: user.id,
      founders: payload.equitySplit.founders as FounderInput[],
      settings: payload.equitySplit.settings as EquitySettings,
    });
    if (r.ok) splitId = r.id;
  }
  if (payload.fundingPlan?.inputs) {
    const r = await persistFundingPlan({
      userId: user.id,
      inputs: payload.fundingPlan.inputs as FundingPlanInput,
    });
    if (r.ok) fundingId = r.id;
  }

  // Mint a Founder Pack only when there's at least one artifact to bundle and
  // the intent was save_founder_pack.
  let packSlug: string | null = null;
  if (
    consumed.intent === "save_founder_pack" &&
    (evaluationId || splitId || fundingId)
  ) {
    const minted = await mintFounderPack({
      userId: user.id,
      evaluationId: evaluationId ?? null,
      splitId: splitId ?? null,
      fundingId: fundingId ?? null,
      ideaName,
    });
    if (minted.ok && minted.slug) packSlug = minted.slug;
  }

  // Set the session cookie. Cookie write must happen in this route handler.
  const ipHash = hashIp(clientIpFromHeaders(request.headers));
  const ua = request.headers.get("user-agent") ?? null;
  const sessionToken = await createSessionRow({
    userId: user.id,
    ipHash,
    userAgent: ua,
  });
  if (!sessionToken) return errorRedirect("session_failed");
  await setSessionCookie(sessionToken);

  // Determine redirect target: pack page > explicit next > homepage.
  let target: string;
  if (packSlug) {
    target = `${siteUrl()}/s/p/${packSlug}?welcome=1`;
  } else if (payload.next && payload.next.startsWith("/")) {
    // Honour the caller-supplied redirect (relative paths only for safety).
    const sep = payload.next.includes("?") ? "&" : "?";
    target = `${siteUrl()}${payload.next}${sep}logged_in=true`;
  } else {
    target = `${siteUrl()}/?logged_in=true`;
  }
  return NextResponse.redirect(target, { status: 303 });
}
