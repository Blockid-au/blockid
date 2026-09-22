// POST /api/svi/dimensions/stream — thin SSE over the ONE report generator
// (S-R3, spec 12-product-ai-tbr-v2.md §C.1 / §C.12).
//
//   auth → project scope (explicit body.projectId verified, else cookie) →
//   credit / tier check → runReportPipeline({ …, onEvent: send }) → persist
//   (inside the runner: today's svi_snapshots + report_v2, or the deck cache
//   keyed deck_hash + pipeline_version) → charge (paid tiers, AFTER success).
//
// The wire vocabulary is unchanged for the streaming client
// (components/svi/svi-stream-analysis.tsx): context · dimension_start ·
// dimension_complete · progress · error · criteria_synthesis_start ·
// criteria_synthesis · cache_hit · done · fatal_error — with the richer
// payloads (`dim`, `chapter`, `valuation_complete`, `executive_complete`,
// `audit_complete`, `gather_complete`, `pipeline_progress`) added alongside.
// `mode: "sequential"` is accepted and ignored: the pipeline runs its waves
// itself. `REPORT_GENERATOR=legacy_stream` serves the previous generator
// (./route.legacy.ts) for one release.
//
// Body: { projectId?, dims?: DimKey[], deckText?, tier?: "free" | "standard" | "premium" | "investor_memo", mode? }

import { getCurrentUser } from "@/lib/auth";
import { apiRoute } from "@/lib/audit/api-route";
import { canAfford, spendCredits, FEATURE_COSTS } from "@/lib/credits";
import { roleCanWrite } from "@/lib/projects";
import { projectScopeOrDenyFor } from "@/lib/project-members/http";
import { DIM_ORDER, type DimKey } from "@/lib/report-pipeline/dimension-owners";
import { runReportPipeline, type StreamEvent } from "@/lib/report-pipeline/run-report-pipeline";
import type { ReportTierV2 } from "@/lib/report-v2/schema";
import { legacyStreamPOST } from "./route.legacy";

export const dynamic = "force-dynamic";

/** Credits per paid tier (the free stream costs nothing). */
const TIER_FEATURE: Record<Exclude<ReportTierV2, "free">, string> = {
  standard: "enhanced_report_standard",
  premium: "enhanced_report_premium",
  investor_memo: "enhanced_report_investor",
};

function legacyGeneratorEnabled(): boolean {
  return (process.env.REPORT_GENERATOR ?? "").toLowerCase() === "legacy_stream";
}

function parseTier(raw: unknown): ReportTierV2 {
  return raw === "standard" || raw === "premium" || raw === "investor_memo" ? raw : "free";
}

function parseDims(raw: unknown): DimKey[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const valid = [...new Set(raw.filter((k): k is DimKey => typeof k === "string" && (DIM_ORDER as readonly string[]).includes(k)))];
  return valid.length > 0 && valid.length < DIM_ORDER.length ? valid : undefined;
}

async function POST_handler(request: Request) {
  if (legacyGeneratorEnabled()) return legacyStreamPOST(request);

  const user = await getCurrentUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  let body: { projectId?: string; dims?: unknown; deckText?: unknown; tier?: unknown; mode?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    // body is optional
  }
  const explicitProjectId = typeof body.projectId === "string" && body.projectId ? body.projectId : null;
  const tier = parseTier(body.tier);
  const dims = parseDims(body.dims);
  // Preserve explicit document intent: blank text must never fall back to a
  // previous project analysis, and partial generation skips first-pass research.
  const deckText = typeof body.deckText === "string" ? body.deckText : null;
  if (deckText !== null && !deckText.trim()) {
    return Response.json({ ok: false, error: "needs_input", message: "The supplied document has no readable text. Please provide readable business information." }, { status: 400 });
  }
  if (deckText !== null && dims) {
    return Response.json({ ok: false, error: "full_analysis_required", message: "A new document requires a full analysis. Start a full analysis to assess all criteria before opening individual sections." }, { status: 400 });
  }

  // Project scope: an explicit id is verified (404 non-member / 403 below viewer);
  // the report is built from the OWNER's record (scope.dataEmail).
  const { scope, denied } = await projectScopeOrDenyFor(user, explicitProjectId, "viewer");
  if (denied) return denied;
  const projectId = scope?.projectId ?? explicitProjectId;
  const ownerEmail = scope?.dataEmail ?? user.email;
  const ownerUserId = scope?.ownerUserId ?? user.id;
  // A viewer may watch a run but must not write today's snapshot / report_v2
  // for the owner's project (W3 review): persist only for editor+.
  const canPersist = scope ? roleCanWrite(scope.role) : true;

  // Credit / tier check — paid tiers only; the caller's wallet, spent AFTER success.
  const featureKey = tier === "free" ? null : TIER_FEATURE[tier];
  if (featureKey) {
    const afford = await canAfford(user.id, featureKey);
    if (!afford.allowed) {
      return new Response(JSON.stringify({ ok: false, error: "Insufficient credits", balance: afford.balance, cost: afford.cost, tier }), { status: 402, headers: { "Content-Type": "application/json" } });
    }
  }

  const baseUrl = (() => {
    try {
      const u = new URL(request.url);
      return `${u.protocol}//${u.host}`;
    } catch {
      return undefined;
    }
  })();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: StreamEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Controller may have been closed if the client disconnected.
        }
      };
      // SSE heartbeat: W1–W3 and the auditor can be silent for minutes and
      // nginx's proxy_read_timeout resets per event — a comment line every
      // 15 s keeps the connection alive (W3 review).
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
        } catch {
          /* closed */
        }
      }, 15_000);
      try {
        const result = await runReportPipeline({
          userId: user.id,
          ownerEmail,
          callerEmail: user.email,
          ownerUserId,
          projectId,
          tier,
          dims,
          deckText,
          baseUrl,
          persist: canPersist,
          onEvent: send,
        });
        if (result.ok && !result.fromCache && featureKey) {
          // Transparent pricing: charge only a delivered, usable report —
          // and only if the client is still there to receive it.
          if (request.signal.aborted) {
            console.warn("[svi-stream] client disconnected before delivery — not charged", { userId: user.id, featureKey, reportId: result.reportId });
          } else {
            const spend = await spendCredits(user.id, featureKey, { tier, reportId: result.reportId, projectId, calls: result.calls });
            if (!spend.ok) console.warn("[svi-stream] credit spend failed after delivery", { userId: user.id, featureKey });
          }
        }
      } catch (err) {
        send({ type: "fatal_error", message: err instanceof Error ? err.message : String(err) });
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // disable nginx buffering for SSE
      "X-Report-Generator": "pipeline",
      "X-Report-Tier-Cost": featureKey ? String(FEATURE_COSTS[featureKey] ?? "") : "0",
    },
  });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/svi/dimensions/stream/route.ts", method: "POST" }, POST_handler);
