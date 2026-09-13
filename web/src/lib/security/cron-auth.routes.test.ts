// Shared auth-gate table for every /api/cron/* route (S8-E, 2026-09-11).
//
// Two layers:
//   1. Static guard — every `route.ts` under src/app/api/cron/** imports
//      `isCronAuthorised` from "@/lib/security/cron-auth", and no non-test
//      file under that tree reads `process.env.CRON_SECRET` or the raw
//      credential headers / query itself. A future route that pastes an
//      ad-hoc `authHeader !== \`Bearer ${CRON_SECRET}\`` compare fails here.
//   2. Dynamic table — every route's GET and POST are imported and called
//      with a missing / wrong / prefix / suffix / raw / lowercase-scheme
//      credential (all must 401), and with the correct secret (must NOT 401).
//      The negative cases never leave the gate, so no downstream mocks are
//      needed for them. The positive case runs with Supabase stubbed to
//      "not configured" so routes answer 503 instead of touching a database;
//      routes whose post-gate work is not safely stubbable (AI runs, deploys,
//      shell scripts, file writes) are listed in POSITIVE_SKIP with the
//      reason and are covered by their own colocated test or by layer 1.

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Supabase → "not configured": the common first step after the gate, so most
// routes return 503 without a network call.
vi.mock("@/lib/supabase", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    getSupabaseAdmin: () => null,
    isSupabaseConfigured: () => false,
  };
});
// Nothing in this table should send mail, ping Telegram, spawn a process or
// leave the box.
vi.mock("@/lib/email", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, sendEmail: vi.fn(async () => ({ ok: true, id: "stub" })) };
});
vi.mock("@/lib/telegram", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const stub = Object.fromEntries(
    Object.keys(actual).filter((k) => typeof actual[k] === "function").map((k) => [k, vi.fn(async () => true)]),
  );
  return { ...actual, ...stub };
});
vi.mock("child_process", () => ({
  execSync: vi.fn(() => ""),
  exec: vi.fn(),
  execFile: vi.fn(),
  spawn: vi.fn(() => ({ on: vi.fn(), stdout: { on: vi.fn() }, stderr: { on: vi.fn() }, unref: vi.fn() })),
  spawnSync: vi.fn(() => ({ status: 0, stdout: "", stderr: "" })),
}));
vi.mock("node:child_process", () => ({
  execSync: vi.fn(() => ""),
  exec: vi.fn(),
  execFile: vi.fn(),
  spawn: vi.fn(() => ({ on: vi.fn(), stdout: { on: vi.fn() }, stderr: { on: vi.fn() }, unref: vi.fn() })),
  spawnSync: vi.fn(() => ({ status: 0, stdout: "", stderr: "" })),
}));

const SECRET = "s8e-routes-table-secret";
const CRON_DIR = join(process.cwd(), "src/app/api/cron");
// The credential-handling scan covers the whole API tree, not just cron/ —
// `api/internal/ai-complete` carried the same ad-hoc compare (review P2 #1).
const API_DIR = join(process.cwd(), "src/app/api");
const HELPER_IMPORT = /from\s+["']@\/lib\/security\/cron-auth["']/;

// Substrings that mean "this file authenticates on its own" — banned outside
// the helper. Plain `includes` so a regex literal such as
// `/process\.env\.CRON_SECRET/` in security-posture does not trip it.
const BANNED = [
  "env.CRON_SECRET",
  'env["CRON_SECRET"]',
  "env['CRON_SECRET']",
  'headers.get("authorization")',
  "headers.get('authorization')",
  'headers.get("x-cron-secret")',
  "headers.get('x-cron-secret')",
  'searchParams.get("secret")',
  "searchParams.get('secret')",
];

/**
 * Routes whose correct-secret path cannot be exercised without heavy mocks.
 * Each still gets the full negative table above and the static guard; the
 * positive path is pinned by the colocated test named, or only by the static
 * import check when there is none.
 */
const POSITIVE_SKIP: Record<string, string> = {
  "agent-auto-improve": "runs AI improvement loop + self-deploy fetch (static guard only)",
  "agent-deploy": "writes files + runs deploy pipeline from the request body (static guard only)",
  "agent-guardian": "own test: agent-guardian/route.test.ts",
  "agent-healthcheck": "own test: agent-healthcheck/route.test.ts",
  "agent-orchestrator": "fans out to sibling cron routes over HTTP (static guard only)",
  "agent-research": "AI research tasks (static guard only)",
  "agent-upgrade": "AI upgrade tasks + email (static guard only)",
  "ai-health-check": "live provider probes (static guard only)",
  "ai-health": "provider probe + admin alert (static guard only)",
  "ai-model-discovery": "live provider catalogue fetch (static guard only)",
  "ceo-daily-summary": "AI summary + report file write (static guard only)",
  "clevel-daily-reports": "AI report generation + file writes (static guard only)",
  "cron-health": "own test: cron-health/route.test.ts (positive path writes an alert-state file)",
  "discover-models": "own test: discover-models/route.test.ts",
  "milestone-report": "own test: milestone-report/route.test.ts",
  "nightly-clevel-review": "spawns scripts/nightly-clevel-review.mjs (static guard only)",
  "publish-insight": "writes content/insights + manifest (static guard only)",
  "refresh-models": "own test: refresh-models/route.test.ts",
  "security-posture": "walks the repo + writes security-posture.json (static guard only)",
  "server-cleanup": "runs the server cleanup shell script + log write (static guard only)",
  "svi-exchange-orchestrator": "runs the exchange cycle against content/ (static guard only)",
  "telegram-report": "reads daily agent reports + sends Telegram (static guard only)",
  "verify-models": "live model verification (static guard only)",
};

interface RouteEntry {
  name: string;
  file: string;
  source: string;
  hasOwnTest: boolean;
}

function listRoutes(): RouteEntry[] {
  return readdirSync(CRON_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => ({ name: e.name, file: join(CRON_DIR, e.name, "route.ts") }))
    .filter((r) => existsSync(r.file))
    .map((r) => ({
      ...r,
      source: readFileSync(r.file, "utf8"),
      hasOwnTest: existsSync(join(CRON_DIR, r.name, "route.test.ts")),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function listSourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) listSourceFiles(p, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(e.name) && !/\.test\.(ts|tsx|mjs|js)$/.test(e.name) && statSync(p).isFile()) out.push(p);
  }
  return out;
}

const ROUTES = listRoutes();

type Handler = (req: Request) => Promise<Response>;

function req(name: string, method: "GET" | "POST", auth?: string | null, extraHeaders: Record<string, string> = {}): Request {
  const headers: Record<string, string> = { ...extraHeaders };
  if (auth) headers.authorization = auth;
  // `dry=1` / `dry_run=1` are honoured by the routes that support a dry run
  // and ignored by the rest; `skip_email=1` likewise.
  return new Request(`http://localhost/api/cron/${name}?dry=1&dry_run=1&skip_email=1`, { method, headers });
}

// ── 1. Static guard ─────────────────────────────────────────────────────────

describe("cron auth static guard", () => {
  it("finds the cron routes at all (guards against a silent empty sweep)", () => {
    expect(ROUTES.length).toBeGreaterThan(50);
  });

  it("every cron route imports isCronAuthorised from @/lib/security/cron-auth", () => {
    const missing = ROUTES.filter((r) => !HELPER_IMPORT.test(r.source) || !/\bisCronAuthorised\s*\(/.test(r.source)).map((r) => r.name);
    expect(
      missing,
      `These cron routes do not authenticate through isCronAuthorised:\n  ${missing.join("\n  ")}`,
    ).toEqual([]);
  });

  it("no file under src/app/api/** reads CRON_SECRET or the raw cron credential itself", () => {
    const offenders: string[] = [];
    for (const file of listSourceFiles(API_DIR)) {
      const src = readFileSync(file, "utf8");
      // Outside cron/ an `authorization` header read is legitimate API-key
      // auth; only direct CRON_SECRET handling is banned there.
      const needles = file.startsWith(CRON_DIR) ? BANNED : BANNED.filter((n) => n.includes("CRON_SECRET") && n.startsWith("env"));
      for (const needle of needles) {
        if (src.includes(needle)) offenders.push(`${relative(API_DIR, file)}: ${needle}`);
      }
    }
    expect(
      offenders,
      `Ad-hoc cron credential handling found — use isCronAuthorised() (and cronSecret() for outbound calls):\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });

  it("the helper itself is the only place the secret is compared", () => {
    const helper = readFileSync(join(process.cwd(), "src/lib/security/cron-auth.ts"), "utf8");
    expect(helper).toContain("timingSafeEqual");
    expect(helper).toContain("process.env.CRON_SECRET");
  });

  it("POSITIVE_SKIP only names routes that exist, and cites a colocated test where it claims one", () => {
    const names = new Set(ROUTES.map((r) => r.name));
    for (const [name, reason] of Object.entries(POSITIVE_SKIP)) {
      expect(names.has(name), `POSITIVE_SKIP names unknown route ${name}`).toBe(true);
      if (reason.startsWith("own test:")) {
        expect(existsSync(join(CRON_DIR, name, "route.test.ts")), `${name} claims a colocated test that does not exist`).toBe(true);
      }
    }
  });
});

// ── 2. Dynamic table ────────────────────────────────────────────────────────

const loaded = new Map<string, { GET?: Handler; POST?: Handler }>();

let origSecret: string | undefined;
let origFetch: typeof fetch;
let origFounderDigest: string | undefined;

beforeAll(async () => {
  origSecret = process.env.CRON_SECRET;
  origFounderDigest = process.env.FOUNDER_DIGEST;
  process.env.CRON_SECRET = SECRET;
  // founder-weekly-digest answers 200 before the gate when FOUNDER_DIGEST=off.
  delete process.env.FOUNDER_DIGEST;
  origFetch = globalThis.fetch;
  globalThis.fetch = vi.fn(async () => {
    throw new Error("network disabled in cron-auth.routes.test");
  }) as unknown as typeof fetch;

  for (const r of ROUTES) {
    const mod = (await import(/* @vite-ignore */ r.file)) as { GET?: Handler; POST?: Handler };
    loaded.set(r.name, { GET: mod.GET, POST: mod.POST });
  }
  // Importing ~80 routes pulls in most of src/lib; on a loaded box that is
  // well past vitest's 10 s default hook budget.
}, 120_000);

afterAll(() => {
  if (origSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = origSecret;
  if (origFounderDigest === undefined) delete process.env.FOUNDER_DIGEST;
  else process.env.FOUNDER_DIGEST = origFounderDigest;
  globalThis.fetch = origFetch;
});

const NEGATIVE: Array<[label: string, auth: string | null]> = [
  ["missing", null],
  ["wrong", "Bearer nope"],
  ["prefix", `Bearer ${SECRET.slice(0, -1)}`],
  ["suffix", `Bearer ${SECRET}X`],
  ["raw (no Bearer prefix)", SECRET],
  ["lowercase scheme", `bearer ${SECRET}`],
  ["empty bearer", "Bearer "],
];

describe.each(ROUTES.map((r) => [r.name, r] as const))("/api/cron/%s", (name, route) => {
  it("exports GET and/or POST", () => {
    const mod = loaded.get(name)!;
    expect(typeof mod.GET === "function" || typeof mod.POST === "function").toBe(true);
  });

  for (const method of ["GET", "POST"] as const) {
    it.each(NEGATIVE)(`${method} → 401 with %s credential`, async (_label, auth) => {
      const handler = loaded.get(name)![method];
      if (!handler) return;
      const res = await handler(req(name, method, auth));
      expect(res.status).toBe(401);
      const body = (await res.json()) as Record<string, unknown>;
      // Every route's 401 body says "unauthorized" in one of the pinned shapes
      // ({error}|{ok,error}|{ok,reason}); the shape itself is pinned by the
      // colocated tests, so only the meaning is asserted here.
      expect(String(body.error ?? body.reason).toLowerCase()).toBe("unauthorized");
    });

    it(`${method} → 401 with the correct secret when CRON_SECRET is unset (fail-closed)`, async () => {
      const handler = loaded.get(name)![method];
      if (!handler) return;
      delete process.env.CRON_SECRET;
      try {
        const res = await handler(req(name, method, `Bearer ${SECRET}`));
        // nightly-clevel-review answers 503 "not configured" ahead of the gate.
        expect([401, 503]).toContain(res.status);
      } finally {
        process.env.CRON_SECRET = SECRET;
      }
    });

    it(`${method} → not 401 with the correct secret`, async () => {
      const handler = loaded.get(name)![method];
      if (!handler) return;
      if (POSITIVE_SKIP[name]) {
        // Positive path documented as covered elsewhere; the static guard and
        // negative table above still apply to this route.
        expect(POSITIVE_SKIP[name].length).toBeGreaterThan(0);
        return;
      }
      const res = await handler(req(name, method, `Bearer ${SECRET}`));
      expect(res.status, `${name} ${method} rejected the correct secret`).not.toBe(401);
      // 20 s: the positive path is the first call into each route's lazy
      // imports (supabase, ai-client, fetchers); on a loaded box that cold
      // start alone crossed vitest's 5 s default (sector-multiples-refresh,
      // deploy gate 6, 2026-09-13) while passing in isolation.
    }, 20_000);
  }

  it("legacy x-cron-secret header is accepted only where the route opts in", async () => {
    const optsIn = /xCronSecretHeader:\s*true/.test(route.source);
    const mod = loaded.get(name)!;
    const handler = mod.POST ?? mod.GET!;
    const method = mod.POST ? "POST" : "GET";
    // Wrong header value is rejected everywhere.
    const bad = await handler(req(name, method, null, { "x-cron-secret": SECRET.slice(0, -1) }));
    expect(bad.status).toBe(401);
    // A correct header value only passes where the route opts in — and is
    // only sent where the positive path is safe to run.
    if (!optsIn || !POSITIVE_SKIP[name]) {
      const res = await handler(req(name, method, null, { "x-cron-secret": SECRET }));
      if (optsIn) expect(res.status).not.toBe(401);
      else expect(res.status).toBe(401);
    }
  });
});
