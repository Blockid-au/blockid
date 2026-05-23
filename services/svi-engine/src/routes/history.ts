// GET /latest  — Get latest analysis for an email
// GET /history — Get all analyses for an email

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getSupabase } from "../lib/supabase.js";

interface EmailQuery {
  email: string;
  projectId?: string;
}

interface HistoryQuery extends EmailQuery {
  limit?: string;
  offset?: string;
}

export async function historyRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /latest ───────────────────────────────────────────────────────────
  app.get<{ Querystring: EmailQuery }>(
    "/latest",
    async (request: FastifyRequest<{ Querystring: EmailQuery }>, reply: FastifyReply) => {
      const { email, projectId } = request.query;

      if (!email) {
        return reply.code(400).send({ ok: false, error: "email query parameter is required" });
      }

      const supabase = getSupabase();
      if (!supabase) {
        return reply.code(503).send({ ok: false, error: "Database not configured" });
      }

      let query = supabase
        .from("svi_analyses")
        .select("id, email, total_svi, net_adjustment, confidence_multiplier, analysis_json, svi_version, file_name, created_at, project_id")
        .eq("email", email.toLowerCase().trim())
        .order("created_at", { ascending: false })
        .limit(1);

      if (projectId) {
        query = query.eq("project_id", projectId);
      }

      const { data, error } = await query.maybeSingle();

      if (error) {
        request.log.error({ error }, "Failed to fetch latest analysis");
        return reply.code(500).send({ ok: false, error: "Failed to fetch analysis" });
      }

      if (!data) {
        return reply.code(404).send({ ok: false, error: "No analysis found for this email" });
      }

      return {
        ok: true,
        slug: data.id,
        analysis: data.analysis_json,
        totalSVI: data.total_svi,
        version: data.svi_version,
        createdAt: data.created_at,
        projectId: data.project_id,
      };
    },
  );

  // ── GET /history ──────────────────────────────────────────────────────────
  app.get<{ Querystring: HistoryQuery }>(
    "/history",
    async (request: FastifyRequest<{ Querystring: HistoryQuery }>, reply: FastifyReply) => {
      const { email, projectId, limit: limitStr, offset: offsetStr } = request.query;

      if (!email) {
        return reply.code(400).send({ ok: false, error: "email query parameter is required" });
      }

      const supabase = getSupabase();
      if (!supabase) {
        return reply.code(503).send({ ok: false, error: "Database not configured" });
      }

      const limit = Math.min(parseInt(limitStr ?? "20", 10) || 20, 100);
      const offset = parseInt(offsetStr ?? "0", 10) || 0;

      let query = supabase
        .from("svi_analyses")
        .select("id, email, total_svi, net_adjustment, confidence_multiplier, svi_version, file_name, created_at, project_id", { count: "exact" })
        .eq("email", email.toLowerCase().trim())
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (projectId) {
        query = query.eq("project_id", projectId);
      }

      const { data, error, count } = await query;

      if (error) {
        request.log.error({ error }, "Failed to fetch analysis history");
        return reply.code(500).send({ ok: false, error: "Failed to fetch history" });
      }

      return {
        ok: true,
        analyses: (data ?? []).map((row) => ({
          slug: row.id,
          totalSVI: row.total_svi,
          version: row.svi_version,
          fileName: row.file_name,
          createdAt: row.created_at,
          projectId: row.project_id,
        })),
        total: count ?? 0,
        limit,
        offset,
      };
    },
  );
}
