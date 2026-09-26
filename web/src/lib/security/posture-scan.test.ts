// G33-T13 — the security-posture scan recognises shared gates instead of a
// grep list: in-memory fixtures pin the recognition (and that real findings
// stay), and a live-tree pass pins the false positives it used to report.

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  classifyRouteAuth,
  classifyRouteRateLimit,
  createFsModuleReader,
  declarationBody,
  exportedMethods,
  matchesProxyBucket,
  parseImports,
  parseProxyBucketPrefixes,
  routeUrlPath,
  stripComments,
  type ModuleReader,
} from "./posture-scan";

/** In-memory ModuleReader: `@/x` → "src/x.ts". */
function memReader(files: Record<string, string>): ModuleReader {
  return (spec) => {
    if (!spec.startsWith("@/")) return null;
    const file = `src/${spec.slice(2)}.ts`;
    return file in files ? { file, src: files[file] } : null;
  };
}

const LIB = {
  "src/lib/auth.ts": `export async function getCurrentUser() { return null; }\n`,
  "src/lib/intake/access.ts": [
    `import { getCurrentUser } from "@/lib/auth";`,
    `export async function gateIntakeRequest() {`,
    `  const user = await getCurrentUser();`,
    `  if (!user) return { user: null, response: new Response(null, { status: 401 }) };`,
    `  return { user, response: null };`,
    `}`,
    `export function formatIntake(x: string) { return x.trim(); }`,
  ].join("\n"),
  "src/lib/api-keys.ts": `export async function validateApiKey(raw: string) { return { valid: raw.length > 0 }; }\nexport async function checkRateLimit(k: string, n: number) { return { allowed: true }; }\n`,
  "src/lib/api-v1/auth.ts": [
    `import { checkRateLimit, validateApiKey } from "@/lib/api-keys";`,
    `export async function authenticateV1(req: Request, deps: { validate?: typeof validateApiKey } = {}) {`,
    `  const v = await (deps.validate ?? validateApiKey)("k");`,
    `  const rl = await checkRateLimit("k", 60);`,
    `  return { ok: v.valid && rl.allowed };`,
    `}`,
  ].join("\n"),
  "src/lib/api-v1/institutional.ts": [
    `import { authenticateV1 } from "@/lib/api-v1/auth";`,
    `export async function authenticateInstitutional(req: Request) { return authenticateV1(req); }`,
  ].join("\n"),
  "src/lib/audit/api-route.ts": `export function apiRoute(meta: unknown, h: (r: Request) => Promise<Response>) { return h; }\n`,
  // Mentions the primitive only in a comment — not a gate.
  "src/lib/entitlements.ts": `// callers use getCurrentUser() first\nexport async function getEntitlements(plan: string) { return [plan]; }\n`,
  "src/lib/barrel.ts": `export { gateIntakeRequest as gate } from "@/lib/intake/access";\n`,
};
const read = memReader(LIB);
const route = (src: string, file = "src/app/api/x/route.ts") => ({ file, src });

describe("classifyRouteAuth — shared gates are recognised", () => {
  it("a route that calls an imported gate reaching getCurrentUser is gated (the old grep said Ungated)", () => {
    const v = classifyRouteAuth(route(`import { gateIntakeRequest as gate } from "@/lib/intake/access";\nexport async function GET() { const g = await gate(); if (g.response) return g.response; return Response.json({}); }`), read);
    expect(v).toEqual({ gated: true, via: "shared_gate", chain: ["gate", "getCurrentUser"] });
  });

  it("follows two hops and an injected default (authenticateInstitutional → authenticateV1 → validateApiKey)", () => {
    const v = classifyRouteAuth(route(`import { authenticateInstitutional } from "@/lib/api-v1/institutional";\nexport async function GET(req: Request) { const a = await authenticateInstitutional(req); return Response.json(a); }`), read);
    expect(v.via).toBe("shared_gate");
    expect(v.chain).toEqual(["authenticateInstitutional", "authenticateV1", "validateApiKey"]);
  });

  it("follows a re-export barrel", () => {
    expect(classifyRouteAuth(route(`import { gate } from "@/lib/barrel";\nexport async function GET() { return (await gate()).response ?? Response.json({}); }`), read).via).toBe("shared_gate");
  });

  it("a same-file helper that calls the gate counts", () => {
    const v = classifyRouteAuth(route(`import { gateIntakeRequest } from "@/lib/intake/access";\nasync function guard() { return gateIntakeRequest(); }\nexport async function GET() { await guard(); return Response.json({}); }`), read);
    expect(v.gated).toBe(true);
  });

  it("direct legacy primitives and the // PUBLIC tag still count", () => {
    expect(classifyRouteAuth(route(`import { isCronAuthorised } from "@/lib/security/cron-auth";\nexport async function POST(r: Request) { if (!isCronAuthorised(r)) return new Response(null, { status: 401 }); return Response.json({}); }`), read).via).toBe("direct");
    expect(classifyRouteAuth(route(`// PUBLIC — health probe\nexport async function GET() { return Response.json({ ok: true }); }`), read).via).toBe("public_tag");
  });
});

describe("classifyRouteAuth — real findings stay", () => {
  it("apiRoute() is the audit wrapper, not an auth gate", () => {
    expect(classifyRouteAuth(route(`import { apiRoute } from "@/lib/audit/api-route";\nasync function h() { return Response.json({}); }\nexport const POST = apiRoute({ route: "api/x/route.ts", method: "POST" }, h);`), read)).toEqual({ gated: false, via: null });
  });
  it("an imported helper that only mentions the primitive in a comment is not a gate", () => {
    expect(classifyRouteAuth(route(`import { getEntitlements } from "@/lib/entitlements";\nexport async function GET() { return Response.json(await getEntitlements("free")); }`), read).gated).toBe(false);
  });
  it("importing a gate module without calling its gate is not gated", () => {
    expect(classifyRouteAuth(route(`import { formatIntake } from "@/lib/intake/access";\nexport async function POST() { return Response.json({ v: formatIntake(" a ") }); }`), read).gated).toBe(false);
  });
  it("a name that appears only in the import line is not a use", () => {
    expect(classifyRouteAuth(route(`import { gateIntakeRequest } from "@/lib/intake/access";\nexport async function GET() { return Response.json({}); }`), read).gated).toBe(false);
  });
  it("a package import never resolves to a gate", () => {
    expect(classifyRouteAuth(route(`import { z } from "zod";\nexport async function POST() { z.string(); return Response.json({}); }`), read).gated).toBe(false);
  });
});

describe("classifyRouteRateLimit", () => {
  const prefixes = parseProxyBucketPrefixes(`const BUCKET_ROUTES: ReadonlyArray<readonly [prefix: string, bucket: RateLimitBucket]> = [\n  ["/api/svi", "svi"],\n  ["/api/data-room/share/", "data-room-pdf"],\n  ["/api/lead", "lead"],\n];`);
  it("parses proxy BUCKET_ROUTES and matches like bucketFor", () => {
    expect(prefixes).toEqual(["/api/svi", "/api/data-room/share/", "/api/lead"]);
    expect(matchesProxyBucket("/api/svi/benchmarks/[sector]", prefixes)).toBe("/api/svi");
    expect(matchesProxyBucket("/api/sviX", prefixes)).toBeNull();
    expect(matchesProxyBucket("/api/data-room/share/[token]/pdf", prefixes)).toBe("/api/data-room/share/");
    expect(matchesProxyBucket("/api/data-room/share", prefixes)).toBe("/api/data-room/share/");
  });
  it("direct call, shared helper, proxy bucket, exempt — and a real gap", () => {
    const src = (body: string) => ({ file: "src/app/api/x/route.ts", src: body });
    expect(classifyRouteRateLimit(src(`import { checkRateLimit } from "@/lib/rate-limit";\nexport async function POST() { await checkRateLimit("lead", ["k"]); return Response.json({}); }`), "api/x/route.ts", read, prefixes).via).toBe("direct");
    expect(classifyRouteRateLimit(src(`import { authenticateV1 } from "@/lib/api-v1/auth";\nexport async function GET(r: Request) { return Response.json(await authenticateV1(r)); }`), "api/v1/x/route.ts", read, prefixes)).toMatchObject({ limited: true, via: "shared_helper" });
    expect(classifyRouteRateLimit(src(`export async function POST() { return Response.json({}); }`), "api/lead/route.ts", read, prefixes)).toEqual({ limited: true, via: "proxy_bucket", detail: "/api/lead" });
    expect(classifyRouteRateLimit(src(`// @rate-limit-exempt static\nexport async function GET() { return Response.json({}); }`), "api/y/route.ts", read, prefixes).via).toBe("exempt");
    expect(classifyRouteRateLimit(src(`import { checkRateLimit } from "@/lib/rate-limit";\nexport async function POST() { return Response.json({}); }`), "api/y/route.ts", read, prefixes)).toEqual({ limited: false, via: null });
  });
});

describe("helpers", () => {
  it("parseImports skips type-only imports and keeps aliases", () => {
    expect(parseImports(`import type { A } from "a";\nimport { type B, c, d as e } from "@/x";\nimport f from "g";`)).toEqual([
      { imported: "c", local: "c", spec: "@/x" },
      { imported: "d", local: "e", spec: "@/x" },
      { imported: "default", local: "f", spec: "g" },
    ]);
  });
  it("declarationBody stops at the next top-level declaration; stripComments keeps URLs", () => {
    const src = `export function a() {\n  return 1;\n}\nexport function b() { return 2; }`;
    expect(declarationBody(src, "a")).toBe(`export function a() {\n  return 1;\n}\n`);
    expect(declarationBody(src, "zz")).toBeNull();
    expect(stripComments(`const u = "https://x.y"; // getCurrentUser\n/* requireUser */ ok();`)).toBe(`const u = "https://x.y"; \n ok();`);
  });
  it("routeUrlPath and exportedMethods", () => {
    expect(routeUrlPath("api/(grp)/tbr/[token]/lead/route.ts")).toBe("/api/tbr/[token]/lead");
    expect(exportedMethods(`export async function GET() {}\nexport const POST = apiRoute(m, h);\nexport { h as DELETE };`).sort()).toEqual(["DELETE", "GET", "POST"]);
  });
});

describe("live tree (G33-T13 false positives)", () => {
  const web = path.resolve(__dirname, "../../..");
  const srcDir = path.join(web, "src");
  const readFs = createFsModuleReader(srcDir, (p) => { try { return readFileSync(p, "utf8"); } catch { return null; } });
  const classify = (rel: string) => {
    const file = path.join(srcDir, "app", rel);
    return classifyRouteAuth({ file, src: readFileSync(file, "utf8") }, readFs);
  };

  it.each([
    "api/intake/links/route.ts",
    "api/evaluations/batch/[id]/snapshot/route.ts",
    "api/founder/competitors/route.ts",
    "api/v1/institutional/benchmarks/route.ts",
    "api/email/resend-webhook/route.ts",
    "api/history/ingest/route.ts",
  ])("%s is recognised as gated", (rel) => {
    expect(classify(rel).gated).toBe(true);
  });

  it("a genuinely public route is still reported", () => {
    expect(classify("api/health/route.ts").gated).toBe(false);
  });

  it("recognises the proxy buckets of the real src/proxy.ts", () => {
    const prefixes = parseProxyBucketPrefixes(readFileSync(path.join(srcDir, "proxy.ts"), "utf8"));
    expect(prefixes).toEqual(expect.arrayContaining(["/api/svi", "/api/lead", "/api/auth/reset-password"]));
  });

  it("the posture route uses the classifier, not a grep list", () => {
    const routeSrc = readFileSync(path.join(srcDir, "app/api/cron/security-posture/route.ts"), "utf8");
    expect(routeSrc).toContain("classifyRouteAuth(");
    expect(routeSrc).toContain("classifyRouteRateLimit(");
    expect(routeSrc).not.toMatch(/const hasUserAuth = /);
  });

  it("every route file parses without throwing", () => {
    const files: string[] = [];
    (function walk(d: string) {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name === "route.ts" || e.name === "route.tsx") files.push(p);
      }
    })(path.join(srcDir, "app/api"));
    expect(files.length).toBeGreaterThan(100);
    for (const f of files) expect(() => classifyRouteAuth({ file: f, src: readFileSync(f, "utf8") }, readFs)).not.toThrow();
  });
});
