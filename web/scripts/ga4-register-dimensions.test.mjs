// S23-B — CLI wrapper around registerCustomDimensions: arg parsing, the
// dry-run default, the exit-2 blocked path that prints the two operator
// steps verbatim, --json output, and the .env loader (exported env wins).

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { EXIT_BLOCKED, EXIT_ERROR, EXIT_OK, exitCodeFor, formatResult, loadEnv, main, parseArgs } from "./ga4-register-dimensions.mjs";

const STEPS = [
  "1. Enable the Google Analytics Admin API (analyticsadmin.googleapis.com) in GCP project 990415480608: open https://console.developers.google.com/apis/api/analyticsadmin.googleapis.com/overview?project=990415480608 …",
  "2. In GA4 → Admin → Property access management, add sa@x.iam.gserviceaccount.com with the Editor role …",
];

function base(overrides = {}) {
  return {
    ok: true,
    dryRun: true,
    property: "properties/123456789",
    serviceAccount: "sa@x.iam.gserviceaccount.com",
    created: [],
    existing: ["arm"],
    missing: ["variant", "plan"],
    unmanaged: [],
    blocked: null,
    error: null,
    ...overrides,
  };
}

function capture() {
  const lines = [];
  return { lines, stdout: (s) => lines.push(s), stderr: (s) => lines.push(`ERR ${s}`) };
}

describe("parseArgs", () => {
  it("defaults to dry-run; --apply switches it off; --json / --help are flags", () => {
    expect(parseArgs([])).toEqual({ dryRun: true, json: false, help: false, envFile: null });
    expect(parseArgs(["--env-file=/x/.env"])).toMatchObject({ envFile: "/x/.env", dryRun: true });
    expect(parseArgs(["--dry-run"])).toMatchObject({ dryRun: true });
    expect(parseArgs(["--apply", "--json"])).toMatchObject({ dryRun: false, json: true });
    expect(parseArgs(["-h"])).toMatchObject({ help: true });
  });
  it("rejects --apply together with --dry-run", () => {
    expect(() => parseArgs(["--apply", "--dry-run"])).toThrow(/mutually exclusive/);
  });
});

describe("exitCodeFor / formatResult", () => {
  it("ok → 0, error → 1, blocked → 2", () => {
    expect(exitCodeFor(base())).toBe(EXIT_OK);
    expect(exitCodeFor(base({ ok: false, error: "ECONNRESET" }))).toBe(EXIT_ERROR);
    expect(exitCodeFor(base({ ok: false, blocked: { reason: "api_disabled", steps: STEPS, message: "m" } }))).toBe(EXIT_BLOCKED);
  });
  it("dry-run output lists existing + to-create and the --apply hint", () => {
    const text = formatResult(base());
    expect(text).toContain("DRY-RUN on properties/123456789");
    expect(text).toContain("existing : arm");
    expect(text).toContain("to create: variant, plan");
    expect(text).toContain("--apply");
  });
  it("blocked output prints the two operator steps verbatim", () => {
    const text = formatResult(base({ ok: false, blocked: { reason: "api_disabled", steps: STEPS, message: "Admin API has not been used in project 990415480608" } }));
    expect(text).toContain("BLOCKED  : api_disabled");
    expect(text).toContain(STEPS[0]);
    expect(text).toContain(STEPS[1]);
    expect(text).not.toContain("to create");
  });
  it("apply output lists created / FAILED / unmanaged", () => {
    const text = formatResult(base({ dryRun: false, created: ["variant"], missing: ["plan"], unmanaged: ["legacy"], ok: false, error: "plan: boom" }));
    expect(text).toContain("APPLY");
    expect(text).toContain("created  : variant");
    expect(text).toContain("FAILED   : plan");
    expect(text).toContain("unmanaged: legacy");
    expect(text).toContain("error    : plan: boom");
  });
});

describe("main", () => {
  it("dry-run by default: calls register with dryRun:true and exits 0", async () => {
    const register = vi.fn(async () => base());
    const c = capture();
    const code = await main([], { register, env: { GA4_PROPERTY_ID: "1" }, ...c });
    expect(code).toBe(EXIT_OK);
    expect(register).toHaveBeenCalledWith({ dryRun: true, env: { GA4_PROPERTY_ID: "1" } });
    expect(c.lines.join("\n")).toContain("DRY-RUN");
  });

  it("--apply passes dryRun:false", async () => {
    const register = vi.fn(async () => base({ dryRun: false, created: ["variant", "plan"], missing: [] }));
    const c = capture();
    const code = await main(["--apply"], { register, env: {}, ...c });
    expect(code).toBe(EXIT_OK);
    expect(register.mock.calls[0][0].dryRun).toBe(false);
    expect(c.lines.join("\n")).toContain("created  : variant, plan");
  });

  it("the 403 blocked result exits 2 and prints the steps", async () => {
    const register = vi.fn(async () => base({ ok: false, blocked: { reason: "api_disabled", steps: STEPS, message: "disabled" } }));
    const c = capture();
    const code = await main(["--apply"], { register, env: {}, ...c });
    expect(code).toBe(EXIT_BLOCKED);
    const text = c.lines.join("\n");
    expect(text).toContain("Operator steps");
    expect(text).toContain("analyticsadmin.googleapis.com/overview?project=990415480608");
    expect(text).toContain("Editor role");
  });

  it("--json prints the raw result", async () => {
    const register = vi.fn(async () => base());
    const c = capture();
    await main(["--json"], { register, env: {}, ...c });
    expect(JSON.parse(c.lines[0])).toMatchObject({ property: "properties/123456789", missing: ["variant", "plan"] });
  });

  it("bad flags exit 1 with a message on stderr; --help exits 0", async () => {
    const c = capture();
    expect(await main(["--apply", "--dry-run"], { register: vi.fn(), env: {}, ...c })).toBe(EXIT_ERROR);
    expect(c.lines[0]).toMatch(/^ERR .*mutually exclusive/);
    const h = capture();
    expect(await main(["--help"], { register: vi.fn(), env: {}, ...h })).toBe(EXIT_OK);
    expect(h.lines[0]).toContain("usage:");
  });
});

describe("loadEnv", () => {
  it("reads KEY=value lines (quotes stripped), skips junk, and lets the process env win", () => {
    const dir = mkdtempSync(join(tmpdir(), "ga4-env-"));
    const file = join(dir, ".env");
    writeFileSync(file, '# comment\nGA4_PROPERTY_ID="123"\nGOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL=sa@x\nnot a line\nlower=case\n');
    const env = loadEnv(file, { GA4_PROPERTY_ID: "999" });
    expect(env.GA4_PROPERTY_ID).toBe("999");
    expect(env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL).toBe("sa@x");
    expect(env.lower).toBeUndefined();
  });
  it("a missing .env yields just the process env", () => {
    expect(loadEnv("/nonexistent/.env", { A: "1" })).toEqual({ A: "1" });
  });
});
