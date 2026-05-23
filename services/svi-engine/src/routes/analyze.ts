// POST /analyze — Core SVI analysis endpoint
//
// Accepts raw startup description text, extracts signals, computes SVI score,
// persists to svi_analyses table, and updates svi_accounts.

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { extractSignals } from "../lib/signals.js";
import { computeSVI, computeMetricsBonus } from "../lib/scoring.js";
import { getSupabase } from "../lib/supabase.js";
import { newSlug } from "../lib/slug.js";
import type { EvidenceItem, StartupMetricsInput } from "../lib/types.js";

interface AnalyzeBody {
  rawText: string;
  email?: string;
  stage?: string;
  startupName?: string;
  websiteUrl?: string;
  industry?: string;
  fileName?: string;
  projectId?: string;
  userId?: string;
  evidenceItems?: EvidenceItem[];
  metrics?: StartupMetricsInput;
}

interface RescoreBody {
  email: string;
  projectId?: string;
}

interface ShareBody {
  slug: string;
}

export async function analyzeRoutes(app: FastifyInstance): Promise<void> {
  // ── POST /analyze ─────────────────────────────────────────────────────────
  app.post<{ Body: AnalyzeBody }>(
    "/analyze",
    async (request: FastifyRequest<{ Body: AnalyzeBody }>, reply: FastifyReply) => {
      const body = request.body;

      if (!body?.rawText?.trim()) {
        return reply.code(400).send({ ok: false, error: "rawText is required" });
      }

      const email = body.email?.toLowerCase().trim() ?? null;

      // Build enriched text with optional metadata
      const enrichedParts = [body.rawText];
      if (body.startupName) enrichedParts.push(`Company: ${body.startupName}`);
      if (body.websiteUrl) enrichedParts.push(`Website: ${body.websiteUrl}`);
      if (body.industry) enrichedParts.push(`Industry: ${body.industry}`);
      if (body.stage) enrichedParts.push(`Stage: ${body.stage}`);
      const enrichedText = enrichedParts.join("\n");

      // Extract signals from text
      const signals = extractSignals(
        { rawText: enrichedText, fileName: body.fileName },
        body.fileName,
        body.evidenceItems,
        body.metrics,
      );

      // Compute metrics bonus if metrics provided
      let metricsBonus: number | undefined;
      if (body.metrics) {
        metricsBonus = computeMetricsBonus(body.metrics);
      }

      // Compute SVI analysis
      const analysis = computeSVI(signals, undefined, metricsBonus);

      const supabase = getSupabase();
      let slug = newSlug();
      let persisted = false;

      if (supabase && email) {
        // Persist analysis to svi_analyses
        const { error } = await supabase.from("svi_analyses").insert({
          id: slug,
          email,
          raw_input: body.rawText,
          file_name: body.fileName ?? null,
          total_svi: analysis.totalSVI,
          net_adjustment: analysis.netAdjustment,
          confidence_multiplier: analysis.confidenceMultiplier,
          analysis_json: analysis,
          svi_version: analysis.version,
          project_id: body.projectId ?? null,
        }).select("id").single();

        if (error) {
          request.log.error({ error }, "Supabase insert failed for svi_analyses");
          slug = `svi-demo-${slug.slice(0, 6)}`;
        } else {
          persisted = true;
        }

        // Update svi_accounts
        if (persisted) {
          try {
            const { data: existingAccount } = await supabase
              .from("svi_accounts")
              .select("id")
              .eq("email", email)
              .eq("project_id", body.projectId ?? "default")
              .maybeSingle();

            if (existingAccount) {
              await supabase.from("svi_accounts").update({
                current_svi: analysis.totalSVI,
                current_stage: analysis.stage ?? 0,
                last_active_at: new Date().toISOString(),
              }).eq("id", existingAccount.id);
            } else {
              await supabase.from("svi_accounts").insert({
                email,
                project_id: body.projectId ?? "default",
                startup_name: body.startupName ?? null,
                current_svi: analysis.totalSVI,
                current_stage: analysis.stage ?? 0,
                last_active_at: new Date().toISOString(),
              });
            }
          } catch (err) {
            request.log.warn({ err }, "Failed to update svi_accounts (non-blocking)");
          }
        }

        // Update analysis usage tracking
        try {
          const { data: existingUsage } = await supabase
            .from("svi_analysis_usage")
            .select("total_analyses, free_used")
            .eq("email", email)
            .maybeSingle();

          if (existingUsage) {
            await supabase
              .from("svi_analysis_usage")
              .update({
                total_analyses: (Number(existingUsage.total_analyses) || 0) + 1,
                free_used: true,
                last_analysis_at: new Date().toISOString(),
              })
              .eq("email", email);
          } else {
            await supabase
              .from("svi_analysis_usage")
              .insert({
                email,
                total_analyses: 1,
                free_used: true,
                last_analysis_at: new Date().toISOString(),
              });
          }
        } catch (err) {
          request.log.warn({ err }, "Failed to update svi_analysis_usage (non-blocking)");
        }
      } else if (!supabase) {
        slug = `svi-demo-${slug.slice(0, 6)}`;
      }

      return {
        ok: true,
        slug,
        analysis,
        persisted,
      };
    },
  );

  // ── POST /rescore ─────────────────────────────────────────────────────────
  // Re-runs scoring on the latest raw input for the given email.
  app.post<{ Body: RescoreBody }>(
    "/rescore",
    async (request: FastifyRequest<{ Body: RescoreBody }>, reply: FastifyReply) => {
      const { email, projectId } = request.body ?? {};

      if (!email) {
        return reply.code(400).send({ ok: false, error: "email is required" });
      }

      const supabase = getSupabase();
      if (!supabase) {
        return reply.code(503).send({ ok: false, error: "Database not configured" });
      }

      // Fetch latest analysis for the email
      let query = supabase
        .from("svi_analyses")
        .select("id, raw_input, file_name")
        .eq("email", email.toLowerCase().trim())
        .order("created_at", { ascending: false })
        .limit(1);

      if (projectId) {
        query = query.eq("project_id", projectId);
      }

      const { data: latest, error } = await query.maybeSingle();

      if (error || !latest) {
        return reply.code(404).send({ ok: false, error: "No previous analysis found for this email" });
      }

      // Re-extract and re-score
      const signals = extractSignals({
        rawText: latest.raw_input,
        fileName: latest.file_name ?? undefined,
      });
      const analysis = computeSVI(signals);

      // Update existing record
      await supabase.from("svi_analyses").update({
        total_svi: analysis.totalSVI,
        net_adjustment: analysis.netAdjustment,
        confidence_multiplier: analysis.confidenceMultiplier,
        analysis_json: analysis,
        svi_version: analysis.version,
      }).eq("id", latest.id);

      return {
        ok: true,
        analysis,
      };
    },
  );

  // ── POST /share ───────────────────────────────────────────────────────────
  app.post<{ Body: ShareBody }>(
    "/share",
    async (request: FastifyRequest<{ Body: ShareBody }>, reply: FastifyReply) => {
      const { slug } = request.body ?? {};

      if (!slug) {
        return reply.code(400).send({ ok: false, error: "slug is required" });
      }

      const supabase = getSupabase();
      if (!supabase) {
        return reply.code(503).send({ ok: false, error: "Database not configured" });
      }

      // Verify slug exists
      const { data: analysis } = await supabase
        .from("svi_analyses")
        .select("id")
        .eq("id", slug)
        .maybeSingle();

      if (!analysis) {
        return reply.code(404).send({ ok: false, error: "Analysis not found" });
      }

      // Share URL is deterministic based on slug
      const shareUrl = `/s/${slug}`;

      return {
        ok: true,
        shareUrl,
      };
    },
  );
}
