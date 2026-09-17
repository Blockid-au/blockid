// G14-S38 — Airtable destination: POST /v0/{base}/{table}, Bearer token,
// typecast, config validation, redaction.
import { describe, expect, it } from "vitest";
import { buildEnvelope } from "../registry";
import { airtableConfigSchema, airtableDestination, airtableTableUrl, buildAirtableRecord } from "./airtable";

const ENVELOPE = buildEnvelope(
  "assessment.submitted",
  {
    assessment_id: "as-1",
    project_id: "p-1",
    evaluation_id: "e-1",
    startup_name: "Acme Pty Ltd",
    decision: "track",
    conviction: 3,
    version: 1,
    submitted_at: "2026-09-17T00:00:00.000Z",
    dossier_url: "https://blockid.au/workspace/evaluations/e-1",
  },
  { id: "d-1", now: new Date("2026-09-17T00:00:00.000Z") },
);

describe("airtableDestination", () => {
  it("kind / label / hostAllowList", () => {
    expect(airtableDestination.kind).toBe("airtable");
    expect(airtableDestination.hostAllowList).toEqual(["api.airtable.com"]);
  });

  it("configSchema: token >=16 chars, base_id matches appXXXXXXXXXXXXXX (14 alnum), table non-empty; .strict() rejects extras", () => {
    expect(airtableConfigSchema.safeParse({ api_version: 1, token: "0123456789abcdef", base_id: "appAAAAAAAAAAAAAA", table: "Deals" }).success).toBe(true);
    expect(airtableConfigSchema.safeParse({ api_version: 1, token: "short", base_id: "appAAAAAAAAAAAAAA", table: "Deals" }).success).toBe(false);
    expect(airtableConfigSchema.safeParse({ api_version: 1, token: "0123456789abcdef", base_id: "not-a-base-id", table: "Deals" }).success).toBe(false);
    expect(airtableConfigSchema.safeParse({ api_version: 1, token: "0123456789abcdef", base_id: "appAAAAAAAAAAAAAA", table: "" }).success).toBe(false);
    expect(airtableConfigSchema.safeParse({ api_version: 1, token: "0123456789abcdef", base_id: "appAAAAAAAAAAAAAA", table: "Deals", extra: 1 }).success).toBe(false);
  });

  it("airtableTableUrl: base + URL-encoded table name", () => {
    expect(airtableTableUrl({ base_id: "appAAAAAAAAAAAAAA", table: "Deals & Notes" })).toBe("https://api.airtable.com/v0/appAAAAAAAAAAAAAA/Deals%20%26%20Notes");
  });

  it("endpointUrl derives the table url from config (url argument ignored)", () => {
    const config = { api_version: 1 as const, token: "0123456789abcdef", base_id: "appAAAAAAAAAAAAAA", table: "Deals" };
    expect(airtableDestination.endpointUrl(config, null)).toBe("https://api.airtable.com/v0/appAAAAAAAAAAAAAA/Deals");
    expect(airtableDestination.endpointUrl(config, "https://ignored.example.com")).toBe("https://api.airtable.com/v0/appAAAAAAAAAAAAAA/Deals");
  });

  it("publicConfig redacts the token; keeps base_id and table", () => {
    expect(airtableDestination.publicConfig({ api_version: 1, token: "secret-pat-0123456789", base_id: "appAAAAAAAAAAAAAA", table: "Deals" })).toEqual({
      api_version: 1,
      base_id: "appAAAAAAAAAAAAAA",
      table: "Deals",
    });
  });

  it("buildAirtableRecord: one record with the shared summary fields + Delivery id + Received at, typecast true", () => {
    const rec = buildAirtableRecord(ENVELOPE);
    expect(rec.typecast).toBe(true);
    const fields = (rec.records as Array<{ fields: Record<string, unknown> }>)[0].fields;
    expect(fields.Delivery).toBe("d-1");
    expect(fields["Received at"]).toBe("2026-09-17T00:00:00.000Z");
    expect(fields.Startup).toBe("Acme Pty Ltd");
    expect(fields.Decision).toBe("track");
  });

  it("transform(): POSTs the record with a Bearer token; the token never appears in the body", () => {
    const config = { api_version: 1 as const, token: "SECRET-PAT-0123456789", base_id: "appAAAAAAAAAAAAAA", table: "Deals" };
    const plan = airtableDestination.transform(ENVELOPE, config);
    expect(plan.url).toBe("https://api.airtable.com/v0/appAAAAAAAAAAAAAA/Deals");
    expect(plan.headers.Authorization).toBe("Bearer SECRET-PAT-0123456789");
    expect(plan.body).not.toContain("SECRET-PAT-0123456789");
    expect(plan.followUps).toBeUndefined();
  });
});
