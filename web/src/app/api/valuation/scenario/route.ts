import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { projectScopeOrDeny } from "@/lib/project-members/http";
import { calculateCfoScenario, cfoScenarioCsv, type CfoScenarioInput } from "@/lib/valuation/cfo-scenario";
import { apiRoute } from "@/lib/audit/api-route";

export const dynamic = "force-dynamic";

/** Pure authenticated preview: no credits, AI calls, or official record writes. */
async function POST_handler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const { scope, denied } = await projectScopeOrDeny("viewer");
  if (denied) return denied;
  try {
    const reader = request.body?.getReader();
    const decoder = new TextDecoder();
    let raw = "", bytes = 0;
    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 256_000) {
            await reader.cancel();
            return NextResponse.json({ ok: false, error: "Scenario is too large" }, { status: 413 });
          }
          raw += decoder.decode(value, { stream: true });
        }
        raw += decoder.decode();
      } finally { reader.releaseLock(); }
    }
    const input = JSON.parse(raw) as CfoScenarioInput;
    if (!input || !Array.isArray(input.methods)) throw new Error("Methods are required");
    // Scope cannot be selected by a body email/entity override.
    const entityId = scope?.projectId ?? user.id;
    if (input.methods.some(method => method?.context?.entityId !== entityId)) return NextResponse.json({ ok: false, error: "Scenario entity must match the current project" }, { status: 403 });
    const result = calculateCfoScenario(input);
    if (request.nextUrl.searchParams.get("format") === "csv") return new NextResponse(cfoScenarioCsv(result), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="cfo-scenario.csv"', "Cache-Control": "no-store" },
    });
    return NextResponse.json({ ok: true, result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error && error.name !== "TypeError" ? error.message : "Invalid or incomplete financial scenario" }, { status: 400 });
  }
}

export const POST = apiRoute({ route: "api/valuation/scenario/route.ts", method: "POST" }, POST_handler);
