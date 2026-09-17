// G14-S38 — destination registry: parseDestinationInput (create-route
// validation), the config seal round-trip, host allow-list enforcement at
// planDelivery time (defence in depth — a config can never point a
// delivery off its kind's allowed hosts even if a transform is buggy).
import { describe, expect, it } from "vitest";
import { buildEnvelope } from "../registry";
import {
  destinationFor,
  DESTINATION_KINDS,
  DESTINATION_LABELS,
  hostAllowList,
  HOST_REFUSED,
  isDestinationKind,
  isHostAllowed,
  openDestinationConfig,
  parseDestinationInput,
  planDelivery,
  sealDestinationConfig,
} from "./index";

const ENVELOPE = buildEnvelope("ping", { endpoint_id: "ep-1", sent_at: "2026-09-17T00:00:00.000Z" }, { id: "d-1", now: new Date("2026-09-17T00:00:00.000Z") });

describe("DESTINATION_KINDS / isDestinationKind / DESTINATION_LABELS", () => {
  it("generic, slack, affinity, airtable — in that order", () => {
    expect(DESTINATION_KINDS).toEqual(["generic", "slack", "affinity", "airtable"]);
  });
  it("isDestinationKind narrows correctly", () => {
    for (const k of DESTINATION_KINDS) expect(isDestinationKind(k)).toBe(true);
    expect(isDestinationKind("bogus")).toBe(false);
    expect(isDestinationKind(undefined)).toBe(false);
    expect(isDestinationKind(null)).toBe(false);
  });
  it("every kind has a label", () => {
    for (const k of DESTINATION_KINDS) expect(typeof DESTINATION_LABELS[k]).toBe("string");
  });
});

describe("hostAllowList / isHostAllowed", () => {
  it("generic has no allow-list (any public https host, via the SSRF guard elsewhere)", () => {
    expect(hostAllowList("generic")).toBeNull();
    expect(isHostAllowed("https://anything.example.com", "generic")).toBe(true);
  });
  it("slack / affinity / airtable are pinned to their fixed host", () => {
    expect(hostAllowList("slack")).toEqual(["hooks.slack.com"]);
    expect(isHostAllowed("https://hooks.slack.com/x", "slack")).toBe(true);
    expect(isHostAllowed("https://evil.example.com/x", "slack")).toBe(false);
    expect(isHostAllowed("https://api.affinity.co/notes", "affinity")).toBe(true);
    expect(isHostAllowed("https://api.airtable.com/v0/x", "airtable")).toBe(true);
    expect(isHostAllowed("not a url", "slack")).toBe(false);
  });
});

describe("parseDestinationInput", () => {
  it("generic: requires a url; kind omitted/empty defaults to generic", () => {
    expect(parseDestinationInput(undefined, undefined, "https://h.example.com/x")).toEqual({ ok: true, kind: "generic", url: "https://h.example.com/x", config: null });
    expect(parseDestinationInput("", undefined, "https://h.example.com/x").ok).toBe(true);
    expect(parseDestinationInput("generic", undefined, null)).toEqual({ ok: false, error: "url_required" });
  });

  it("unknown kind is rejected", () => {
    expect(parseDestinationInput("bogus", undefined, "https://h.example.com/x")).toEqual({ ok: false, error: "unknown_kind" });
  });

  it("slack: url required, must resolve onto hooks.slack.com", () => {
    const ok = parseDestinationInput("slack", {}, "https://hooks.slack.com/services/T0/B0/x");
    expect(ok).toMatchObject({ ok: true, kind: "slack", url: "https://hooks.slack.com/services/T0/B0/x" });
    expect(parseDestinationInput("slack", {}, null)).toEqual({ ok: false, error: "url_required" });
    const badHost = parseDestinationInput("slack", {}, "https://evil.example.com/x");
    expect(badHost).toMatchObject({ ok: false, error: "host_not_allowed", allowed: ["hooks.slack.com"] });
  });

  it("affinity: config validated, url derived (user url ignored) — invalid config surfaces Zod issue paths", () => {
    const ok = parseDestinationInput("affinity", { api_key: "0123456789abcdef", organization_id: 1 }, null);
    expect(ok).toMatchObject({ ok: true, kind: "affinity", url: "https://api.affinity.co/notes" });
    const bad = parseDestinationInput("affinity", { api_key: "short" }, null);
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.error).toBe("invalid_destination");
      expect(bad.issues?.some((i) => i.path === "api_key")).toBe(true);
      expect(bad.issues?.some((i) => i.path === "organization_id")).toBe(true);
    }
  });

  it("airtable: config validated, url derived from base_id/table", () => {
    const ok = parseDestinationInput("airtable", { token: "0123456789abcdef", base_id: "appAAAAAAAAAAAAAA", table: "Deals" }, null);
    expect(ok).toMatchObject({ ok: true, kind: "airtable", url: "https://api.airtable.com/v0/appAAAAAAAAAAAAAA/Deals" });
  });

  it("missing config object still validated against the schema (empty object → required-field issues, not a crash)", () => {
    const bad = parseDestinationInput("airtable", undefined, null);
    expect(bad.ok).toBe(false);
  });
});

describe("config seal round-trip (sealDestinationConfig / openDestinationConfig — same scheme as sign.ts secret_enc)", () => {
  it("round-trips a valid config", () => {
    const config = { api_version: 1 as const, token: "0123456789abcdef", base_id: "appAAAAAAAAAAAAAA", table: "Deals" };
    const sealed = sealDestinationConfig(config);
    expect(sealed).not.toContain("0123456789abcdef");
    expect(openDestinationConfig("airtable", sealed)).toEqual(config);
  });

  it("returns null for a missing, malformed or tampered sealed string", () => {
    expect(openDestinationConfig("airtable", null)).toBeNull();
    expect(openDestinationConfig("airtable", "not-sealed-at-all")).toBeNull();
    const sealed = sealDestinationConfig({ api_version: 1, token: "0123456789abcdef", base_id: "appAAAAAAAAAAAAAA", table: "Deals" });
    const tampered = sealed.slice(0, -4) + "abcd";
    expect(openDestinationConfig("airtable", tampered)).toBeNull();
  });

  it("returns null when the opened JSON no longer matches the kind's schema (kind/config mismatch)", () => {
    const sealed = sealDestinationConfig({ api_version: 1, api_key: "0123456789abcdef", organization_id: 1 });
    // Opened as airtable (wrong kind) — schema mismatch, not a crash.
    expect(openDestinationConfig("airtable", sealed)).toBeNull();
  });
});

describe("planDelivery — host allow-list is re-checked at dispatch time (defence in depth)", () => {
  it("ok: plan carries the transform's request(s), all on the kind's allowed host", () => {
    const config = { api_version: 1 as const };
    const result = planDelivery("slack", ENVELOPE, config, "https://hooks.slack.com/services/T0/B0/x");
    expect(result.ok).toBe(true);
  });

  it("host_not_allowed: a transform that (somehow) targets a foreign host is refused with HOST_REFUSED + the host", () => {
    // Slack's transform just echoes `endpointUrl` back — passing a foreign
    // url exercises the allow-list guard planDelivery runs after transform.
    const result = planDelivery("slack", ENVELOPE, { api_version: 1 }, "https://evil.example.com/hook");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(`${HOST_REFUSED}evil.example.com`);
  });

  it("transform_failed: a throwing transform is caught, never propagates", () => {
    const dest = destinationFor("slack");
    const original = dest.transform;
    try {
      dest.transform = () => {
        throw new Error("boom");
      };
      const result = planDelivery("slack", ENVELOPE, { api_version: 1 }, "https://hooks.slack.com/x");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("transform_failed:boom");
    } finally {
      dest.transform = original;
    }
  });
});
