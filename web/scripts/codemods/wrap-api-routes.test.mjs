import { describe, expect, it } from "vitest";
import {
  exportedMutationMethods,
  isAllowListed,
  patternToRegex,
  renderCatalogue,
  routeFamily,
  transformSource,
  wrappedMethods,
} from "./wrap-api-routes.mjs";

// S20-A — codemod is idempotent and only touches mutating handlers.

const ROUTE = "api/projects/[id]/members/route.ts";

const FIXTURE = `import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  getCurrentUser,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return NextResponse.json({ ok: true });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return NextResponse.json({ id });
}

export function DELETE(request: Request) {
  return NextResponse.json({ ok: true });
}

export const PATCH = patchHandler(CFG);

export { POST as PUT };
`;

describe("transformSource", () => {
  it("wraps POST/DELETE/PATCH, leaves GET alone, adds the import after the last import", () => {
    const { changed, src, methods } = transformSource(FIXTURE, ROUTE);
    expect(changed).toBe(true);
    expect(methods.sort()).toEqual(["DELETE", "PATCH", "POST"]);
    expect(src).toContain("async function POST_handler(");
    expect(src).toContain("function DELETE_handler(request: Request)");
    expect(src).toContain("const PATCH_handler = patchHandler(CFG);");
    expect(src).toContain("export async function GET(request: Request)");
    expect(src).toContain(`export const POST = apiRoute({ route: "${ROUTE}", method: "POST" }, POST_handler);`);
    expect(src).toContain(`export const PATCH = apiRoute({ route: "${ROUTE}", method: "PATCH" }, PATCH_handler);`);
    expect(src).toContain(`export const DELETE = apiRoute({ route: "${ROUTE}", method: "DELETE" }, DELETE_handler);`);
    // import lands after the multi-line "@/lib/auth" import, before the code
    const importIdx = src.indexOf('import { apiRoute } from "@/lib/audit/api-route";');
    expect(importIdx).toBeGreaterThan(src.indexOf('from "@/lib/auth";'));
    expect(importIdx).toBeLessThan(src.indexOf("export const dynamic"));
    // the alias re-export still points at the (now wrapped) POST binding
    expect(src).toContain("export { POST as PUT };");
    expect(src.match(/export const POST = apiRoute/g)).toHaveLength(1);
  });

  it("is idempotent: a second pass changes nothing", () => {
    const first = transformSource(FIXTURE, ROUTE);
    const second = transformSource(first.src, ROUTE);
    expect(second.changed).toBe(false);
    expect(second.src).toBe(first.src);
    expect(second.methods).toEqual([]);
    expect(wrappedMethods(first.src)).toEqual(new Set(["POST", "PATCH", "DELETE"]));
  });

  it("wraps only the methods that are not wrapped yet (partial state)", () => {
    const partial = `import { apiRoute } from "@/lib/audit/api-route";
async function POST_handler() { return new Response(); }
export const POST = apiRoute({ route: "${ROUTE}", method: "POST" }, POST_handler);
export async function DELETE() { return new Response(); }
`;
    const out = transformSource(partial, ROUTE);
    expect(out.methods).toEqual(["DELETE"]);
    expect(out.src.match(/import \{ apiRoute \}/g)).toHaveLength(1);
    expect(out.src.match(/export const POST = apiRoute/g)).toHaveLength(1);
    expect(out.src).toContain("export const DELETE = apiRoute(");
  });

  it("leaves a GET-only file untouched", () => {
    const src = `export async function GET() { return new Response(); }\n`;
    const out = transformSource(src, "api/x/route.ts");
    expect(out.changed).toBe(false);
    expect(out.src).toBe(src);
  });

  it("keeps a typed const handler's annotation", () => {
    const src = `export const PUT: Handler = make();\n`;
    const out = transformSource(src, "api/x/route.ts");
    expect(out.src).toContain("const PUT_handler: Handler = make();");
    expect(out.src).toContain('export const PUT = apiRoute({ route: "api/x/route.ts", method: "PUT" }, PUT_handler);');
  });

  it("does not treat a commented-out handler as an export", () => {
    const src = `// export async function POST() {}\nexport async function GET() { return new Response(); }\n`;
    expect(transformSource(src, "api/x/route.ts").changed).toBe(false);
  });
});

describe("helpers", () => {
  it("exportedMutationMethods sees every export form", () => {
    expect(exportedMutationMethods(FIXTURE)).toEqual(new Set(["POST", "DELETE", "PATCH", "PUT"]));
    expect(exportedMutationMethods("export { GET as POST };")).toEqual(new Set(["POST"]));
    expect(exportedMutationMethods("export { GET };")).toEqual(new Set());
  });

  it("allow-list globs", () => {
    expect(patternToRegex("api/cron/**").test("api/cron/a/b/route.ts")).toBe(true);
    expect(patternToRegex("api/cron/**").test("api/cronx/route.ts")).toBe(false);
    expect(patternToRegex("api/*/route.ts").test("api/x/route.ts")).toBe(true);
    expect(patternToRegex("api/*/route.ts").test("api/x/y/route.ts")).toBe(false);
    const entries = [{ pattern: "api/cron/**", reason: "system" }];
    expect(isAllowListed("api/cron/vesting/route.ts", entries)?.reason).toBe("system");
    expect(isAllowListed("api/projects/route.ts", entries)).toBeNull();
  });

  it("routeFamily + catalogue rendering are deterministic", () => {
    expect(routeFamily("api/projects/[id]/members/route.ts")).toBe("projects.members");
    const out = renderCatalogue([
      { route: "api/b/route.ts", family: "b", methods: ["POST"] },
      { route: "api/a/route.ts", family: "a", methods: ["PATCH", "DELETE"] },
    ]);
    expect(out.indexOf('"api/a/route.ts"')).toBeLessThan(out.indexOf('"api/b/route.ts"'));
    expect(out).toContain("export const AUDIT_ROUTE_CATALOGUE");
    expect(out.endsWith("\n")).toBe(true);
  });
});
