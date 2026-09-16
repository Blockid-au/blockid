import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/cron-auth", () => ({ isCronAuthorised: () => true }));

import { GET } from "./route";
import { bqConfigured, resolveScript } from "./resolve";

describe("cron/bq-export", () => {
  it("bqConfigured is false without BQ_PROJECT_ID", () => {
    expect(bqConfigured({})).toBe(false);
    expect(bqConfigured({ BQ_PROJECT_ID: "  " })).toBe(false);
    expect(bqConfigured({ BQ_PROJECT_ID: "blockid-analytics" })).toBe(true);
  });

  it("skips cleanly (200, ok) when BigQuery is not configured — deferred integration must not red-flag cron health", async () => {
    const prev = process.env.BQ_PROJECT_ID;
    delete process.env.BQ_PROJECT_ID;
    try {
      const res = await GET(new Request("https://blockid.au/api/cron/bq-export"));
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean; skipped?: string };
      expect(body.ok).toBe(true);
      expect(body.skipped).toBe("bq_not_configured");
    } finally {
      if (prev !== undefined) process.env.BQ_PROJECT_ID = prev;
    }
  });

  it("resolves the tsx CLI from the source checkout even when cwd is a standalone release dir", () => {
    const r = resolveScript("/tmp/not-a-checkout");
    expect(r.scriptPath.endsWith("scripts/bq-export-events.ts")).toBe(true);
    // The dev checkout has tsx installed; a release dir does not.
    expect(r.tsxCli === null || r.tsxCli.endsWith("node_modules/tsx/dist/cli.mjs")).toBe(true);
  });
});
