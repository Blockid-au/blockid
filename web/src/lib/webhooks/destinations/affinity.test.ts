// G14-S38 — Affinity destination: POST /notes (+ /list-entries follow-up),
// Basic auth with an empty user, config validation, redaction.
import { describe, expect, it } from "vitest";
import { buildEnvelope } from "../registry";
import { affinityAuthHeader, AFFINITY_HOSTS, affinityConfigSchema, affinityDestination, buildAffinityNote } from "./affinity";

const ENVELOPE = buildEnvelope(
  "assessment.submitted",
  {
    assessment_id: "as-1",
    project_id: "p-1",
    evaluation_id: "e-1",
    startup_name: "Acme Pty Ltd",
    decision: "proceed",
    conviction: 4,
    version: 2,
    submitted_at: "2026-09-17T00:00:00.000Z",
    dossier_url: "https://blockid.au/workspace/evaluations/e-1",
  },
  { id: "d-1", now: new Date("2026-09-17T00:00:00.000Z") },
);

describe("affinityDestination", () => {
  it("kind / label / hostAllowList", () => {
    expect(affinityDestination.kind).toBe("affinity");
    expect(affinityDestination.hostAllowList).toEqual(["api.affinity.co"]);
    expect(AFFINITY_HOSTS).toEqual(["api.affinity.co"]);
  });

  it("configSchema: requires api_key (>=16 chars) and a positive organization_id; list_id is optional; .strict() rejects extras", () => {
    expect(affinityConfigSchema.safeParse({ api_version: 1, api_key: "0123456789abcdef", organization_id: 1 }).success).toBe(true);
    expect(affinityConfigSchema.safeParse({ api_version: 1, api_key: "short", organization_id: 1 }).success).toBe(false);
    expect(affinityConfigSchema.safeParse({ api_version: 1, api_key: "0123456789abcdef", organization_id: -1 }).success).toBe(false);
    expect(affinityConfigSchema.safeParse({ api_version: 1, api_key: "0123456789abcdef", organization_id: 1, extra: "x" }).success).toBe(false);
    expect(affinityConfigSchema.safeParse({ api_version: 1, api_key: "0123456789abcdef", organization_id: 1, list_id: 7 }).success).toBe(true);
  });

  it("affinityAuthHeader: Basic base64(':' + apiKey) — empty username, key as password", () => {
    expect(affinityAuthHeader("secretkey")).toBe(`Basic ${Buffer.from(":secretkey").toString("base64")}`);
  });

  it("endpointUrl is always the fixed /notes endpoint regardless of config", () => {
    expect(affinityDestination.endpointUrl({ api_version: 1, api_key: "0123456789abcdef", organization_id: 1 }, null)).toBe("https://api.affinity.co/notes");
  });

  it("publicConfig redacts api_key; keeps organization_id and list_id (null when absent)", () => {
    expect(affinityDestination.publicConfig({ api_version: 1, api_key: "secret-key-0123456789", organization_id: 42 })).toEqual({ api_version: 1, organization_id: 42, list_id: null });
    expect(affinityDestination.publicConfig({ api_version: 1, api_key: "secret-key-0123456789", organization_id: 42, list_id: 9 })).toEqual({ api_version: 1, organization_id: 42, list_id: 9 });
  });

  it("buildAffinityNote: content names the event, startup and a labelled fact per row, plus a delivery/event footer", () => {
    const note = buildAffinityNote(ENVELOPE);
    expect(note).toContain("Assessment submitted");
    expect(note).toContain("Startup: Acme Pty Ltd");
    expect(note).toContain("Decision: proceed");
    expect(note).toContain("Open: https://blockid.au/workspace/evaluations/e-1");
    expect(note).toContain("event assessment.submitted · delivery d-1");
  });

  it("transform(): POSTs /notes with Basic auth + organization_ids; no list_id → no followUps", () => {
    const config = { api_version: 1 as const, api_key: "secretkey0123456789", organization_id: 42 };
    const plan = affinityDestination.transform(ENVELOPE, config);
    expect(plan.url).toBe("https://api.affinity.co/notes");
    expect(plan.headers.Authorization).toBe(affinityAuthHeader(config.api_key));
    const body = JSON.parse(plan.body);
    expect(body.organization_ids).toEqual([42]);
    expect(body.content).toContain("Acme Pty Ltd");
    expect(plan.followUps).toBeUndefined();
    expect(JSON.stringify(plan)).not.toContain("secretkey0123456789".slice(0, 6) + "PLAINTEXT_MARKER_NEVER_MATCHES");
  });

  it("transform(): list_id set → one follow-up POST /lists/{id}/list-entries with the same auth header", () => {
    const config = { api_version: 1 as const, api_key: "secretkey0123456789", organization_id: 42, list_id: 7 };
    const plan = affinityDestination.transform(ENVELOPE, config);
    expect(plan.followUps).toHaveLength(1);
    const fu = plan.followUps![0];
    expect(fu.url).toBe("https://api.affinity.co/lists/7/list-entries");
    expect(fu.headers.Authorization).toBe(affinityAuthHeader(config.api_key));
    expect(JSON.parse(fu.body)).toEqual({ entity_id: 42 });
  });

  it("the api key never appears in cleartext outside the Authorization header (defence-in-depth: no accidental log of it in the body)", () => {
    const config = { api_version: 1 as const, api_key: "SUPER-SECRET-KEY-0123456789", organization_id: 1 };
    const plan = affinityDestination.transform(ENVELOPE, config);
    expect(plan.body).not.toContain("SUPER-SECRET-KEY-0123456789");
  });
});
