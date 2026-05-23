// POST /v1/analyze — Partner API endpoint (public, API key auth)
//
// Validates API key via the Auth service, checks credits via Billing service,
// then runs SVI analysis and returns a structured response.

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { extractSignals } from "../lib/signals.js";
import { computeSVI } from "../lib/scoring.js";

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? "http://blockid-auth:4012";
const AUTH_SECRET = process.env.AUTH_SECRET ?? "";
const BILLING_URL = process.env.BILLING_URL ?? "http://blockid-billing:4011";
const BILLING_SECRET = process.env.BILLING_SECRET ?? "";

// ── Auth service: validate API key ──────────────────────────────────────────

interface AuthResult {
  userId: string;
  email: string;
  keyId: string;
  plan: string;
}

async function validateApiKey(apiKey: string): Promise<AuthResult | null> {
  try {
    const res = await fetch(`${AUTH_SERVICE_URL}/api-keys/validate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Key": AUTH_SECRET,
      },
      body: JSON.stringify({ apiKey }),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as { ok: boolean } & AuthResult;
    if (!data.ok) return null;

    return {
      userId: data.userId,
      email: data.email,
      keyId: data.keyId,
      plan: data.plan,
    };
  } catch {
    return null;
  }
}

// ── Billing service: credit check + spend ───────────────────────────────────

interface CreditCheckResult {
  allowed: boolean;
  balance: number;
  cost: number;
}

async function checkCredits(userId: string): Promise<CreditCheckResult> {
  try {
    const res = await fetch(`${BILLING_URL}/credits/can-afford`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Key": BILLING_SECRET,
      },
      body: JSON.stringify({ userId, feature: "svi_analysis" }),
    });

    if (!res.ok) return { allowed: false, balance: 0, cost: 0 };

    return (await res.json()) as CreditCheckResult;
  } catch {
    return { allowed: false, balance: 0, cost: 0 };
  }
}

async function spendCredits(
  userId: string,
  metadata: Record<string, unknown>,
): Promise<{ balance: number }> {
  try {
    const res = await fetch(`${BILLING_URL}/credits/spend`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Key": BILLING_SECRET,
      },
      body: JSON.stringify({ userId, feature: "svi_analysis", metadata }),
    });

    if (!res.ok) return { balance: 0 };

    return (await res.json()) as { balance: number };
  } catch {
    return { balance: 0 };
  }
}

// ── Route definition ────────────────────────────────────────────────────────

interface PartnerAnalyzeBody {
  description?: string;
  rawText?: string;
  text?: string;
  startupName?: string;
  name?: string;
  websiteUrl?: string;
  website?: string;
  industry?: string;
  stage?: string;
}

export async function partnerRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: PartnerAnalyzeBody }>(
    "/v1/analyze",
    async (request: FastifyRequest<{ Body: PartnerAnalyzeBody }>, reply: FastifyReply) => {
      // ── Authenticate via API key ─────────────────────────────────────────
      const authHeader = request.headers.authorization;
      if (!authHeader?.startsWith("Bearer bk_live_")) {
        return reply.code(401).send({
          error: {
            code: "unauthorized",
            message: "Invalid or missing API key. Use 'Authorization: Bearer bk_live_...' header.",
          },
        });
      }

      const rawKey = authHeader.slice(7); // Strip "Bearer "
      const auth = await validateApiKey(rawKey);

      if (!auth) {
        return reply.code(401).send({
          error: {
            code: "unauthorized",
            message: "Invalid or missing API key. Use 'Authorization: Bearer bk_live_...' header.",
          },
        });
      }

      // ── Credit check ─────────────────────────────────────────────────────
      const affordCheck = await checkCredits(auth.userId);
      if (!affordCheck.allowed) {
        return reply.code(402).send({
          error: {
            code: "insufficient_credits",
            message: "Not enough credits",
            balance: affordCheck.balance,
          },
        });
      }

      // ── Parse body ────────────────────────────────────────────────────────
      const body = request.body ?? {};
      const startupName = ((body.startupName ?? body.name ?? "") as string);
      const description = ((body.description ?? body.rawText ?? body.text ?? "") as string);
      const websiteUrl = ((body.websiteUrl ?? body.website ?? "") as string);
      const industry = ((body.industry ?? "") as string);
      const stage = ((body.stage ?? "") as string);

      if (!description?.trim()) {
        return reply.code(400).send({
          error: {
            code: "invalid_input",
            message: "description field is required",
          },
        });
      }

      try {
        // Enrich text with partner-supplied metadata
        const enrichedParts = [description];
        if (startupName) enrichedParts.push(`Company: ${startupName}`);
        if (websiteUrl) enrichedParts.push(`Website: ${websiteUrl}`);
        if (industry) enrichedParts.push(`Industry: ${industry}`);
        if (stage) enrichedParts.push(`Stage: ${stage}`);
        const enrichedText = enrichedParts.join("\n");

        // Run SVI analysis
        const signals = extractSignals({ rawText: enrichedText });
        const analysis = computeSVI(signals);

        // Spend credit
        await spendCredits(auth.userId, {
          source: "api",
          keyId: auth.keyId,
          startupName: startupName || undefined,
        });

        // Fetch updated balance
        const updatedAfford = await checkCredits(auth.userId);

        // Build dimension array for the response
        const dimensions = analysis.subs.map((s) => ({
          key: s.key,
          label: s.label,
          score: Math.round(s.value),
        }));

        // Build top 3 gaps sorted by impact (descending)
        const topGaps = analysis.evidenceGaps
          .slice()
          .sort((a, b) => b.impact - a.impact)
          .slice(0, 3)
          .map((g) => ({
            label: g.label,
            impact: g.impact,
          }));

        return {
          ok: true,
          sviScore: analysis.totalSVI,
          stage: analysis.stage,
          stageLabel: analysis.stageLabel,
          dimensions,
          topGaps,
          creditsRemaining: updatedAfford.balance,
          meta: {
            version: analysis.version,
            confidence: Math.round(analysis.confidenceMultiplier * 100),
            summary: analysis.summary,
            riskFlags: analysis.riskPenalties.length,
            allGaps: analysis.evidenceGaps.slice(0, 5).map((g) => ({
              priority: g.priority,
              label: g.label,
              action: g.action,
              impact: g.impact,
            })),
          },
        };
      } catch (err) {
        request.log.error({ err }, "Partner analysis failed");
        return reply.code(500).send({
          error: {
            code: "analysis_failed",
            message: "Analysis could not be completed. Please try again.",
          },
        });
      }
    },
  );
}
