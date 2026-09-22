import { apiRoute } from "@/lib/audit/api-route";
import { isCronAuthorised } from "@/lib/security/cron-auth";
import { originActivity } from "@/lib/ops/origin-activity";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!isCronAuthorised(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const registry = originActivity();
  return Response.json(registry?.snapshot() ?? { retirementEligible: false, reason: "registry_unavailable" }, { status: registry ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
async function postHandler(request: Request) {
  if (!isCronAuthorised(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const registry = originActivity();
  if (!registry) return Response.json({ retirementEligible: false, reason: "registry_unavailable" }, { status: 503 });
  const body = await request.json().catch(() => ({})) as { action?: string };
  if (body.action !== "drain" && body.action !== "resume") return Response.json({ error: "invalid_action" }, { status: 400 });
  return Response.json(body.action === "resume" ? registry.resume() : registry.drain(), { headers: { "Cache-Control": "no-store" } });
}

export const POST = apiRoute({ route: "api/ops/origin-drain/route.ts", method: "POST" }, postHandler);
